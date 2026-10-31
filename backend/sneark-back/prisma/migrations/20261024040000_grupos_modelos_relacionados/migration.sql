CREATE TABLE `grupos_modelos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(100) NOT NULL,
    UNIQUE INDEX `grupos_modelos_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `productos` ADD COLUMN `grupoModeloId` INTEGER NULL;
CREATE INDEX `productos_grupoModeloId_idx` ON `productos`(`grupoModeloId`);
ALTER TABLE `productos` ADD CONSTRAINT `productos_grupoModeloId_fkey`
    FOREIGN KEY (`grupoModeloId`) REFERENCES `grupos_modelos`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
