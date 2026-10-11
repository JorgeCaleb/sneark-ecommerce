ALTER TABLE `pedidos`
    ADD COLUMN `costoEnvio` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `pagadoEn` DATETIME(3) NULL;

CREATE INDEX `pedidos_pagadoEn_idx` ON `pedidos` (`pagadoEn`);
