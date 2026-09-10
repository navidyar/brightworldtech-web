'use strict';

const crypto = require('node:crypto');
const { pool } = require('../models/db');
const unitAuditEventModel = require('../models/unitAuditEventModel');
const { TOOL_SOURCES } = require('./apiToolCredential');

const CERTIFICATE_ID_MAX_LENGTH = 191;

class ApiWipeCertificateError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiWipeCertificateError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeText(value, maxLength = 1000) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeNonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCertificatePayload(certificateId, body = {}) {
  const id = normalizeText(certificateId, CERTIFICATE_ID_MAX_LENGTH);
  if (!id) {
    throw new ApiWipeCertificateError(422, 'INVALID_CERTIFICATE_ID', 'A secure-wipe certificate ID is required.');
  }

  const machine = body.machine && typeof body.machine === 'object' ? body.machine : {};
  const drive = body.drive && typeof body.drive === 'object' ? body.drive : {};
  const wipe = body.wipe && typeof body.wipe === 'object' ? body.wipe : {};
  const startedAt = normalizeDate(body.started_at ?? body.startedAt);
  const completedAt = normalizeDate(body.completed_at ?? body.completedAt);
  const payload = {
    certificateId: id,
    status: normalizeText(body.status, 80),
    startedAt,
    completedAt,
    machineSerial: normalizeText(machine.serial ?? machine.serialNumber, 191),
    machineUuid: normalizeText(machine.uuid, 64),
    driveModel: normalizeText(drive.model, 255),
    driveSerial: normalizeText(drive.serial ?? drive.serialNumber, 191),
    driveSizeBytes: normalizeNonNegativeInteger(drive.size_bytes ?? drive.sizeBytes),
    driveInterface: normalizeText(drive.interface ?? drive.connection, 80),
    driveMediaType: normalizeText(drive.media_type ?? drive.mediaType, 80),
    wipeMethod: normalizeText(wipe.method, 191),
    wipeResult: normalizeText(wipe.result, 120),
    verificationStatement: normalizeText(wipe.verification_statement ?? wipe.verificationStatement ?? body.statement, 1000)
  };

  if (!payload.driveSerial && !payload.driveModel && !payload.wipeMethod && !payload.wipeResult) {
    throw new ApiWipeCertificateError(
      422,
      'WIPE_CERTIFICATE_EVIDENCE_REQUIRED',
      'The secure-wipe certificate must include drive identity or wipe result evidence.'
    );
  }

  return payload;
}

function canonicalEvidence(payload) {
  const dateText = (value) => value instanceof Date ? value.toISOString() : null;
  return {
    certificateId: payload.certificateId,
    status: payload.status,
    startedAt: dateText(payload.startedAt),
    completedAt: dateText(payload.completedAt),
    machineSerial: payload.machineSerial,
    machineUuid: payload.machineUuid,
    driveModel: payload.driveModel,
    driveSerial: payload.driveSerial,
    driveSizeBytes: payload.driveSizeBytes,
    driveInterface: payload.driveInterface,
    driveMediaType: payload.driveMediaType,
    wipeMethod: payload.wipeMethod,
    wipeResult: payload.wipeResult,
    verificationStatement: payload.verificationStatement
  };
}

function buildEvidenceHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalEvidence(payload)), 'utf8').digest('hex');
}

function summarizeCertificate(payload) {
  const result = payload.wipeResult || payload.status || 'Recorded';
  const drive = [payload.driveModel, payload.driveSerial].filter(Boolean).join(' · ');
  const method = payload.wipeMethod ? ` · ${payload.wipeMethod}` : '';
  return `${result}${method}${drive ? ` · ${drive}` : ''}`;
}

async function findStorageDevice(connection, unitId, driveSerial) {
  if (!driveSerial) return null;
  const [rows] = await connection.query(
    `SELECT unit_storage_device_id, is_current
       FROM unit_storage_devices
      WHERE unit_id = ? AND serial_number = ?
      ORDER BY is_current DESC, unit_storage_device_id DESC
      LIMIT 1`,
    [unitId, driveSerial]
  );
  return rows[0] || null;
}

async function recordWipeCertificate({ unitId, certificateId, body, userId, toolSource }) {
  const safeUnitId = normalizePositiveInteger(unitId);
  const safeUserId = normalizePositiveInteger(userId);
  if (!safeUnitId || !safeUserId) {
    throw new ApiWipeCertificateError(422, 'INVALID_WIPE_CERTIFICATE_CONTEXT', 'A valid Unit and authenticated Tech User are required.');
  }
  if (toolSource !== TOOL_SOURCES.SCANTOOL) {
    throw new ApiWipeCertificateError(403, 'WIPE_CERTIFICATE_SOURCE_NOT_ALLOWED', 'Secure-wipe certificates are accepted from ScanTools only.');
  }

  const payload = normalizeCertificatePayload(certificateId, body);
  const evidenceHash = buildEvidenceHash(payload);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [unitRows] = await connection.query('SELECT unit_id FROM units WHERE unit_id = ? LIMIT 1 FOR UPDATE', [safeUnitId]);
    if (!unitRows[0]) {
      throw new ApiWipeCertificateError(404, 'UNIT_NOT_FOUND', 'The selected Unit could not be found.');
    }

    const [existingRows] = await connection.query(
      `SELECT unit_storage_wipe_certificate_id, unit_id, evidence_hash
         FROM unit_storage_wipe_certificates
        WHERE certificate_id = ?
        LIMIT 1
        FOR UPDATE`,
      [payload.certificateId]
    );
    const existing = existingRows[0];
    if (existing) {
      if (Number(existing.unit_id) !== safeUnitId || String(existing.evidence_hash || '') !== evidenceHash) {
        throw new ApiWipeCertificateError(409, 'WIPE_CERTIFICATE_CONFLICT', 'This secure-wipe certificate ID was already recorded with different evidence.');
      }
      await connection.commit();
      return {
        replayed: true,
        unit_id: safeUnitId,
        certificate_id: payload.certificateId,
        unit_storage_wipe_certificate_id: Number(existing.unit_storage_wipe_certificate_id)
      };
    }

    const storageDevice = await findStorageDevice(connection, safeUnitId, payload.driveSerial);
    const [insert] = await connection.query(
      `INSERT INTO unit_storage_wipe_certificates (
         unit_id, unit_storage_device_id, certificate_id, recorded_by_user_id, tool_source,
         certificate_status, started_at, completed_at, machine_serial, machine_uuid,
         drive_model, drive_serial, drive_size_bytes, drive_interface, drive_media_type,
         wipe_method, wipe_result, verification_statement, evidence_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        safeUnitId,
        normalizePositiveInteger(storageDevice?.unit_storage_device_id),
        payload.certificateId,
        safeUserId,
        TOOL_SOURCES.SCANTOOL,
        payload.status,
        payload.startedAt,
        payload.completedAt,
        payload.machineSerial,
        payload.machineUuid,
        payload.driveModel,
        payload.driveSerial,
        payload.driveSizeBytes,
        payload.driveInterface,
        payload.driveMediaType,
        payload.wipeMethod,
        payload.wipeResult,
        payload.verificationStatement,
        evidenceHash
      ]
    );

    await unitAuditEventModel.insertEventWithConnection(connection, {
      unitId: safeUnitId,
      actorUserId: safeUserId,
      eventType: 'unit_secure_wipe_certificate_recorded',
      eventSource: 'api_scantool',
      eventSummary: `Secure wipe certificate ${payload.certificateId} recorded`,
      metadata: {
        certificateId: payload.certificateId,
        unitStorageWipeCertificateId: Number(insert.insertId),
        unitStorageDeviceId: normalizePositiveInteger(storageDevice?.unit_storage_device_id),
        driveSerial: payload.driveSerial,
        driveModel: payload.driveModel,
        wipeMethod: payload.wipeMethod,
        wipeResult: payload.wipeResult
      },
      changes: [{
        fieldKey: 'secure_wipe_certificate',
        fieldLabel: 'Secure Wipe Certificate',
        changeType: 'recorded',
        oldValueText: null,
        newValueText: summarizeCertificate(payload),
        sortOrder: 10
      }]
    });

    await connection.commit();
    return {
      replayed: false,
      unit_id: safeUnitId,
      certificate_id: payload.certificateId,
      unit_storage_wipe_certificate_id: Number(insert.insertId),
      linked_storage_device_id: normalizePositiveInteger(storageDevice?.unit_storage_device_id)
    };
  } catch (error) {
    await connection.rollback();
    if (error instanceof ApiWipeCertificateError) throw error;
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ApiWipeCertificateError,
  normalizeCertificatePayload,
  buildEvidenceHash,
  recordWipeCertificate
};
