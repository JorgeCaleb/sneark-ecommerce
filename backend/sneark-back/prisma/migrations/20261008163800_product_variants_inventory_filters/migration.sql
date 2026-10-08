-- DropIndex
DROP INDEX `tallas_producto_productoId_talla_key` ON `tallas_producto`;

-- AlterTable
ALTER TABLE `items_pedido` ADD COLUMN `codigoColor` VARCHAR(10) NOT NULL,
    ADD COLUMN `genero` ENUM('M', 'W', 'X') NOT NULL,
    ADD COLUMN `nombreColor` VARCHAR(50) NOT NULL,
    ADD COLUMN `sku` VARCHAR(60) NOT NULL;

-- AlterTable
ALTER TABLE `marcas` ADD COLUMN `codigo` VARCHAR(10) NOT NULL;

-- AlterTable
ALTER TABLE `productos` ADD COLUMN `codigoModelo` VARCHAR(20) NOT NULL;

-- AlterTable
ALTER TABLE `tallas_producto` ADD COLUMN `colorId` INTEGER NOT NULL,
    ADD COLUMN `genero` ENUM('M', 'W', 'X') NOT NULL,
    ADD COLUMN `sku` VARCHAR(60) NOT NULL;

-- CreateTable
CREATE TABLE `colores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(50) NOT NULL,
    `codigo` VARCHAR(10) NOT NULL,

    UNIQUE INDEX `colores_nombre_key`(`nombre`),
    UNIQUE INDEX `colores_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `marcas_codigo_key` ON `marcas`(`codigo`);

-- CreateIndex
CREATE UNIQUE INDEX `productos_marcaId_codigoModelo_key` ON `productos`(`marcaId`, `codigoModelo`);

-- CreateIndex
CREATE UNIQUE INDEX `tallas_producto_sku_key` ON `tallas_producto`(`sku`);

-- CreateIndex
CREATE INDEX `tallas_producto_colorId_idx` ON `tallas_producto`(`colorId`);

-- CreateIndex
CREATE UNIQUE INDEX `tallas_producto_productoId_genero_colorId_talla_key` ON `tallas_producto`(`productoId`, `genero`, `colorId`, `talla`);

-- AddForeignKey
ALTER TABLE `tallas_producto` ADD CONSTRAINT `tallas_producto_colorId_fkey` FOREIGN KEY (`colorId`) REFERENCES `colores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
