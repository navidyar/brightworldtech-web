'use strict';
require('dotenv').config();

const { pool } = require('../models/db');
const { SYSTEM_CONFIG_CATEGORY_IDS } = require('../config/configIdentityRegistry');
const { normalizeLookup } = require('../services/apiConfigValueResolver');

const APPLY = process.argv.includes('--apply');

const SEEDS = [
  [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES, 'LPDDR4', 'ddr4'],
  [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES, 'LPDDR4X', 'ddr4'],
  [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES, 'LPDDR5', 'ddr5'],
  [SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES, 'LPDDR5X', 'ddr5'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, '2.5 SATA', 'sata'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, '2.5" SATA', 'sata'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'M.2 SATA', 'sata'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'M2 SATA', 'sata'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'SATA SSD', 'sata'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'M.2 NVMe', 'nvme'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'M2 NVMe', 'nvme'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'NVM Express', 'nvme'],
  [SYSTEM_CONFIG_CATEGORY_IDS.STORAGE_TYPES, 'NVMe SSD', 'nvme'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'US English', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'English (US)', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'English (United States)', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'en-US', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'US EN', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'EN US', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'English United States', 'english_us'],
  [SYSTEM_CONFIG_CATEGORY_IDS.KEYBOARD_LANGUAGES, 'United States English', 'english_us'],
];

async function tableExists(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tool_config_value_aliases'`
  );
  return Number(row.n || 0) > 0;
}

async function ensureTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS tool_config_value_aliases (
      tool_config_value_alias_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      config_category_id INT NOT NULL,
      alias_value VARCHAR(255) NOT NULL,
      normalized_alias VARCHAR(255) NOT NULL,
      target_config_value_id INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by_user_id INT NULL,
      updated_by_user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tool_config_value_alias_id),
      UNIQUE KEY uq_tool_config_alias_category_normalized (config_category_id, normalized_alias),
      KEY idx_tool_config_alias_target (target_config_value_id, is_active),
      CONSTRAINT fk_tool_config_alias_category FOREIGN KEY (config_category_id)
        REFERENCES config_categories (config_category_id) ON DELETE CASCADE ON UPDATE RESTRICT,
      CONSTRAINT fk_tool_config_alias_target FOREIGN KEY (target_config_value_id)
        REFERENCES config_values (config_value_id) ON DELETE CASCADE ON UPDATE RESTRICT,
      CONSTRAINT fk_tool_config_alias_created_by FOREIGN KEY (created_by_user_id)
        REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT,
      CONSTRAINT fk_tool_config_alias_updated_by FOREIGN KEY (updated_by_user_id)
        REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function getCategory(connection, systemId) {
  const [[row]] = await connection.query(
    `SELECT scc.config_category_id, cc.name
       FROM system_config_categories scc
       JOIN config_categories cc ON cc.config_category_id=scc.config_category_id
      WHERE scc.system_config_category_id=? LIMIT 1`, [systemId]
  );
  if (!row) throw new Error(`System config category ${systemId} is not bound.`);
  return row;
}

async function getTarget(connection, categoryId, value) {
  const [[row]] = await connection.query(
    `SELECT config_value_id,label,value,is_active
       FROM config_values
      WHERE config_category_id=? AND LOWER(TRIM(COALESCE(value,'')))=LOWER(TRIM(?))
      ORDER BY is_active DESC, config_value_id LIMIT 1`, [categoryId, value]
  );
  if (!row) throw new Error(`Target value ${value} was not found in config category ${categoryId}.`);
  return row;
}

async function listSeeds(connection) {
  const rows=[];
  for(const [systemId, aliasValue, targetValue] of SEEDS){
    const category=await getCategory(connection, systemId);
    const target=await getTarget(connection, category.config_category_id, targetValue);
    rows.push({systemId,categoryId:Number(category.config_category_id),categoryName:category.name,aliasValue,normalizedAlias:normalizeLookup(aliasValue),targetId:Number(target.config_value_id),targetLabel:target.label,targetValue:target.value});
  }
  return rows;
}

async function inspect(connection) {
  const exists=await tableExists(connection);
  const seeds=await listSeeds(connection);
  let stored=[];
  if(exists){
    const [rows]=await connection.query(`
      SELECT a.tool_config_value_alias_id,a.config_category_id,a.alias_value,a.normalized_alias,a.target_config_value_id,a.is_active,
             cv.label AS target_label,cv.value AS target_value
        FROM tool_config_value_aliases a
        JOIN config_values cv ON cv.config_value_id=a.target_config_value_id
       ORDER BY a.config_category_id,a.alias_value`);
    stored=rows;
  }
  const [[lp4]]=await connection.query(`SELECT config_value_id,is_active FROM config_values WHERE config_value_id=56 LIMIT 1`);
  const [[lp5]]=await connection.query(`SELECT config_value_id,is_active FROM config_values WHERE config_value_id=57 LIMIT 1`);
  return {exists,seeds,stored,lp4:lp4||null,lp5:lp5||null};
}

function printState(state,label){
  console.log(`${label}: alias_table=${state.exists?'yes':'no'} stored_aliases=${state.stored.length} LPDDR4=${state.lp4?'present':'absent'} LPDDR5=${state.lp5?'present':'absent'}`);
  for(const seed of state.seeds) console.log(`  ${seed.categoryName}: ${seed.aliasValue} -> ${seed.targetLabel} (#${seed.targetId})`);
}

async function main(){
  const connection=await pool.getConnection();
  try{
    const before=await inspect(connection);
    console.log(`Tool Configuration Alias migration (${APPLY?'apply':'audit'})`);
    printState(before,'Before');
    if(!APPLY) return;

    await connection.beginTransaction();
    try{
      await ensureTable(connection);
      const seeds=await listSeeds(connection);
      const ramCategory = await getCategory(connection, SYSTEM_CONFIG_CATEGORY_IDS.RAM_TYPES);
      await connection.query(
        `UPDATE config_categories SET description = ? WHERE config_category_id = ?`,
        ['DDR memory types', ramCategory.config_category_id]
      );
      for(const seed of seeds){
        await connection.query(`
          INSERT INTO tool_config_value_aliases
            (config_category_id,alias_value,normalized_alias,target_config_value_id,is_active)
          VALUES (?,?,?,?,1)
          ON DUPLICATE KEY UPDATE
            alias_value=VALUES(alias_value),target_config_value_id=VALUES(target_config_value_id),is_active=1`,
          [seed.categoryId,seed.aliasValue,seed.normalizedAlias,seed.targetId]
        );
      }

      // Dummy/test LPDDR references are intentionally collapsed into the surviving canonical DDR values.
      for(const [fromId,toId] of [[56,54],[57,55]]){
        await connection.query('UPDATE units SET ram_type_config_value_id=? WHERE ram_type_config_value_id=?',[toId,fromId]);
        await connection.query('UPDATE unit_memory_modules SET ram_type_config_value_id=? WHERE ram_type_config_value_id=?',[toId,fromId]);
        await connection.query('UPDATE unit_previous_memory_modules SET ram_type_config_value_id=? WHERE ram_type_config_value_id=?',[toId,fromId]);
        await connection.query('DELETE FROM config_values WHERE config_value_id=?',[fromId]);
      }
      await connection.commit();
    }catch(error){ await connection.rollback(); throw error; }

    const after=await inspect(connection);
    printState(after,'After');
    if(after.lp4||after.lp5) throw new Error('LPDDR4/LPDDR5 config rows still exist after migration.');
    const wanted=new Set(after.seeds.map(x=>`${x.categoryId}:${x.normalizedAlias}:${x.targetId}`));
    const have=new Set(after.stored.filter(x=>Number(x.is_active)===1).map(x=>`${Number(x.config_category_id)}:${x.normalized_alias}:${Number(x.target_config_value_id)}`));
    for(const key of wanted) if(!have.has(key)) throw new Error(`Missing seeded alias ${key}`);
  }finally{ connection.release(); await pool.end(); }
}

main().catch(error=>{console.error(error);process.exit(1)});
