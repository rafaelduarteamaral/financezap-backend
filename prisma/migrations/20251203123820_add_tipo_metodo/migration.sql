-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_transacoes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telefone" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'outros',
    "tipo" TEXT NOT NULL DEFAULT 'saida',
    "metodo" TEXT NOT NULL DEFAULT 'debito',
    "dataHora" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mensagemOriginal" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_transacoes" ("categoria", "criadoEm", "data", "dataHora", "descricao", "id", "mensagemOriginal", "telefone", "valor") SELECT "categoria", "criadoEm", "data", "dataHora", "descricao", "id", "mensagemOriginal", "telefone", "valor" FROM "transacoes";
DROP TABLE "transacoes";
ALTER TABLE "new_transacoes" RENAME TO "transacoes";
CREATE INDEX "transacoes_telefone_idx" ON "transacoes"("telefone");
CREATE INDEX "transacoes_data_idx" ON "transacoes"("data");
CREATE INDEX "transacoes_categoria_idx" ON "transacoes"("categoria");
CREATE INDEX "transacoes_tipo_idx" ON "transacoes"("tipo");
CREATE INDEX "transacoes_metodo_idx" ON "transacoes"("metodo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
