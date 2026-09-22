// Borra TODAS las tablas y vuelve a sembrar desde cero.
// Pensado para iterar en dev: tras correrlo, vuelves al estado inicial.
//
//   DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador \
//     pnpm exec tsx reset.ts && pnpm db:push && pnpm init && pnpm init:workflow && pnpm seed:passwords
//
// (El script imprime el one-liner exacto al final.)

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL no está definida.');

const client = postgres(url, { max: 1 });

console.log('Dropping schema public…');
await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
await client.unsafe('CREATE SCHEMA public');
await client.unsafe('GRANT ALL ON SCHEMA public TO etiquetador');
await client.unsafe('GRANT ALL ON SCHEMA public TO public');

await client.end();
console.log('Hecho. Vuelve a crear el esquema y sembrar con:');
console.log('');
console.log('  cd packages/db');
console.log('  DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm db:push');
console.log('  DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm init');
console.log('  DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm init:workflow');
console.log('  DATABASE_URL=postgres://etiquetador:etiquetador_dev@localhost:5433/etiquetador pnpm seed:passwords');
