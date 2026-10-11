DROP INDEX `pedidos_numeroOperacion_key` ON `pedidos`;

ALTER TABLE `pedidos`
    DROP COLUMN `comprobante`,
    DROP COLUMN `comprobantePublicId`,
    DROP COLUMN `numeroOperacion`,
    MODIFY `metodoPago` ENUM('MERCADOPAGO') NOT NULL;
