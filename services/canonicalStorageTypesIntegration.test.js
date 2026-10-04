'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const ROOT=path.join(__dirname,'..'); const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('Storage Type migration merges M.2 SATA references into canonical SATA and renames NVMe in place',()=>{
 const migration=read('scripts/migrateCanonicalStorageTypes.js');
 assert.match(migration,/SATA_CANONICAL_VALUE = 'sata'/);
 assert.match(migration,/NVME_CANONICAL_VALUE = 'nvme'/);
 assert.match(migration,/UPDATE units SET storage_type_config_value_id = \? WHERE storage_type_config_value_id = \?/);
 assert.match(migration,/UPDATE unit_storage_devices SET storage_type_config_value_id = \? WHERE storage_type_config_value_id = \?/);
 assert.match(migration,/UPDATE unit_previous_storage_devices SET storage_type_config_value_id = \? WHERE storage_type_config_value_id = \?/);
 assert.match(migration,/UPDATE lot_requirements SET requirement_config_value_id = \? WHERE requirement_config_value_id = \?/);
 assert.match(migration,/DELETE FROM operational_option_usage_rankings WHERE option_scope = 'storage_type'/);
});

test('Tool storage resolution uses generic Configuration aliases for SATA/NVMe vocabulary',()=>{
 const storage=read('services/apiStorageInventory.js');
 const migration=read('scripts/migrateToolConfigAliases.js');
 assert.match(storage,/listActiveSystemCategoryAliases/);
 assert.match(storage,/resolveCandidateFromRows/);
 assert.match(migration,/M\.2 SATA/);
 assert.match(migration,/SATA SSD/);
 assert.match(migration,/M\.2 NVMe/);
 assert.match(migration,/NVM Express/);
 assert.doesNotMatch(storage,/\['nvme', 'ssd'\]/);
});
