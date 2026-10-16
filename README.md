# Bàsquet al dia

Web lleugera de resultats i classificacions per a Safari en iOS 12.5.8.

- Web pública: https://web-resultats.vercel.app
- Repositori: https://github.com/AndreuJG/web_resultats
- Projecte Vercel: `web-resultats`.

## Estat

Primera prova de compatibilitat. **Totes les dades són fictícies**. No hi ha integració amb fonts esportives ni directe.

Inclou Lliga Endesa masculina, Lliga Femenina Endesa, Eurolliga masculina i femenina, EuroCup masculina, Basketball Champions League i Tercera FEB E-A (antiga EBA).

## Desenvolupament

Requisit: Node.js 22 o posterior. Sense dependències externes.

```sh
npm run build
```

El generador `scripts/build.js` escriu la web en `dist/`. Vercel executa la mateixa ordre i publica eixa carpeta. El contingut i els estils s'editen en el generador; `dist/` no es versiona.

La consulta i la navegació funcionen sense JavaScript. El script opcional usa sintaxi ES5 i permet programar una recàrrega al cap de 60 segons; després de recarregar, l'opció es desactiva.

## Validació en el dispositiu

1. Obrir l'URL pública en Safari de l'iPad i comprovar HTTPS.
2. Entrar en una competició i llegir les taules en vertical i horitzontal.
3. Provar els enllaços a resultats, classificació i inici.
4. Recarregar manualment i activar/desactivar la recàrrega opcional.
5. Comprovar la navegació amb JavaScript desactivat.

La verificació en un navegador modern no substituïx aquesta prova en l'iPad.

## Següents passos

Validar les fonts oficials i el seu ús, integrar dades des del servidor amb memòria cau, mostrar l'hora de les dades i afegir directe només on la font ho permeta.
