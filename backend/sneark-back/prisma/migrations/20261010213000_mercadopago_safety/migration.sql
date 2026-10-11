-- AlterTable
ALTER TABLE `pedidos`
    MODIFY `estado` ENUM('PENDIENTE', 'PAGO_VERIFICADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO', 'PAGO_REQUIERE_REVISION') NOT NULL DEFAULT 'PENDIENTE',
    ADD COLUMN `mpCheckoutUrl` VARCHAR(500) NULL,
    ADD COLUMN `inventarioReservado` BOOLEAN NOT NULL DEFAULT true,
    ADD UNIQUE INDEX `pedidos_mpPagoId_key`(`mpPagoId`);

-- Los pedidos ya cancelados devolvieron su inventario.
UPDATE `pedidos` SET `inventarioReservado` = false WHERE `estado` = 'CANCELADO';
