ALTER TABLE `pedidos`
    ADD COLUMN `mpEstadoPago` VARCHAR(40) NULL,
    ADD COLUMN `mpMontoReembolsado` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `mpActualizadoEn` DATETIME(3) NULL,
    ADD COLUMN `mpRequiereRevision` BOOLEAN NOT NULL DEFAULT false;
