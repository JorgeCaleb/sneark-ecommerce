-- `logoPublicId` was added to the Prisma schema before it was represented by a
-- migration. Add it only on databases that do not already have the column.
SET @logo_public_id_column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'marcas'
      AND COLUMN_NAME = 'logoPublicId'
);
SET @logo_public_id_migration = IF(
    @logo_public_id_column_exists = 0,
    'ALTER TABLE `marcas` ADD COLUMN `logoPublicId` VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE logo_public_id_statement FROM @logo_public_id_migration;
EXECUTE logo_public_id_statement;
DEALLOCATE PREPARE logo_public_id_statement;

ALTER TABLE `pedidos`
    ADD COLUMN `comprobantePublicId` VARCHAR(255) NULL;

DROP INDEX `pedidos_numeroOperacion_idx` ON `pedidos`;

CREATE UNIQUE INDEX `pedidos_numeroOperacion_key`
    ON `pedidos`(`numeroOperacion`);
