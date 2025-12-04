-- CreateTable
CREATE TABLE "transacoes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telefone" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'outros',
    "dataHora" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "mensagemOriginal" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "numeros_registrados" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telefone" TEXT NOT NULL,
    "primeiraMensagemEnviada" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaMensagemEnviada" DATETIME,
    "totalMensagensEnviadas" INTEGER NOT NULL DEFAULT 1
);

-- CreateIndex
CREATE INDEX "transacoes_telefone_idx" ON "transacoes"("telefone");

-- CreateIndex
CREATE INDEX "transacoes_data_idx" ON "transacoes"("data");

-- CreateIndex
CREATE INDEX "transacoes_categoria_idx" ON "transacoes"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "numeros_registrados_telefone_key" ON "numeros_registrados"("telefone");

-- CreateIndex
CREATE INDEX "numeros_registrados_telefone_idx" ON "numeros_registrados"("telefone");
