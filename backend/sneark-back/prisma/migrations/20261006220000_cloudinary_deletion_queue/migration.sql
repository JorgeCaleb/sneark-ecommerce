CREATE TABLE `cloudinary_delete_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(255) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cloudinary_delete_jobs_publicId_key`(`publicId`),
    INDEX `cloudinary_delete_jobs_nextAttemptAt_idx`(`nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
