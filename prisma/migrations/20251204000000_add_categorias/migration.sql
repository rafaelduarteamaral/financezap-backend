-- CreateTable
CREATE TABLE IF NOT EXISTS "categorias" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telefone" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "padrao" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL DEFAULT 'saida',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "categorias_telefone_idx" ON "categorias"("telefone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "categorias_padrao_idx" ON "categorias"("padrao");

