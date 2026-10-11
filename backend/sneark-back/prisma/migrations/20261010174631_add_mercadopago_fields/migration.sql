-- AlterTable
ALTER TABLE `pedidos` ADD COLUMN `mpPagoId` VARCHAR(100) NULL,
    ADD COLUMN `mpPreferenciaId` VARCHAR(255) NULL,
    MODIFY `metodoPago` ENUM('YAPE', 'PLIN', 'MERCADOPAGO') NOT NULL;
