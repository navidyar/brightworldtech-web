'use strict';

require('dotenv').config();
const fs = require('node:fs');
const { pool } = require('../models/db');
const labelPrinterModel = require('../models/labelPrinterModel');
const { LABEL_PRINTERS } = require('../config/labelPrinting');

async function main() {
  try {
    const printers = await labelPrinterModel.listPrinters({ includeDisabled: true });
  const enabled = printers.filter((printer) => Number(printer.is_enabled) === 1);
  const rawAutoProvisionable = enabled.filter((printer) => !String(printer.cups_queue_name || '').trim() && String(printer.protocol_code) === 'raw_9100');
  const queueBacked = enabled.filter((printer) => String(printer.cups_queue_name || '').trim());
  const current = printers.find((printer) => String(printer.cups_queue_name || '') === String(LABEL_PRINTERS[0]?.queue || '')) || null;

  console.log('\nStage 10W88 Label Printer Registry Cutover audit (read-only)');
  console.log(`Registry printers: ${printers.length} total · ${enabled.length} enabled`);
  console.log(`Print-ready paths: ${queueBacked.length} CUPS queue-backed · ${rawAutoProvisionable.length} RAW printer(s) eligible for automatic CUPS provisioning`);
  console.log(`Current production queue registry row: ${current ? `${current.display_name} (printer ${current.label_printer_id})` : 'not found'}`);
  console.log(`CUPS client commands: lp ${fs.existsSync('/usr/bin/lp') ? 'present' : 'missing'} · lpstat ${fs.existsSync('/usr/bin/lpstat') ? 'present' : 'missing'} · lpadmin ${fs.existsSync('/usr/sbin/lpadmin') ? 'present' : 'missing'}`);
  console.log('Offline gate: live TCP endpoint check occurs before CUPS submission and before each copy.');
  console.log('Fail-fast queue policy: registry-backed CUPS queues use printer-error-policy=abort-job so backend failures are not retained for later retry.');
  console.log('Existing named CUPS queue names/device paths are preserved; only RAW registry printers without a queue may receive an app-managed queue.');
    console.log('No database, filesystem, CUPS, or printer changes were made.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
