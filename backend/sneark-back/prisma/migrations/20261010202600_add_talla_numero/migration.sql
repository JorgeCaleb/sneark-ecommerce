-- AlterTable: agregar columna numérica para ordenación correcta de tallas
ALTER TABLE `tallas_producto`
  ADD COLUMN `tallaNumero` DECIMAL(4, 1) NOT NULL DEFAULT 0;

-- Poblar tallaNumero a partir de los valores de texto existentes
UPDATE `tallas_producto` SET `tallaNumero` = CAST(`talla` AS DECIMAL(4, 1));

-- Eliminar el DEFAULT temporal una vez poblados los datos
ALTER TABLE `tallas_producto` ALTER COLUMN `tallaNumero` DROP DEFAULT;

-- CreateIndex: índice compuesto para ordenación eficiente en inventario
CREATE INDEX `tallas_producto_productoId_genero_colorId_tallaNumero_idx`
  ON `tallas_producto`(`productoId`, `genero`, `colorId`, `tallaNumero`);
