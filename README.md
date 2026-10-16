# Bàsquet al dia

Web lleugera de resultats i classificacions per a Safari en iOS 12.5.8.

- Web pública: https://web-resultats.vercel.app
- Repositori: https://github.com/AndreuJG/web_resultats
- Projecte Vercel: `web-resultats`.

## Publicació

La carpeta local està vinculada amb `AndreuJG/web_resultats` i amb el projecte `web-resultats` de Vercel. Els canvis enviats a `main` es publiquen automàticament en la web de producció. Vercel genera les pàgines amb `npm run build` i publica `dist/`.

## Estat

**Activades amb dades oficials:** Lliga Endesa masculina, Lliga Femenina Endesa, Eurolliga masculina i EuroCup masculina. Eurolliga femenina, Champions i Tercera FEB encara mostren exemples ficticis.

Inclou Lliga Endesa masculina, Lliga Femenina Endesa, Eurolliga masculina i femenina, EuroCup masculina, Basketball Champions League i Tercera FEB E-A (antiga EBA).

## Desenvolupament

Requisit: Node.js 22 o posterior. Dependències del servidor: `@vercel/functions` (memòria cau), `acorn` (lectura de dades SSR) i `seroval` (format dels serveis públics FEB). No s'envien a l'iPad.

```sh
npm ci
npm run build
npm test
npm run dev
```

El generador `scripts/build.js` escriu les pàgines estàtiques en `dist/`. Les quatre competicions activades es generen al servidor amb les funcions d'`api/`. Comparteixen plantilla HTML i tenen adaptadors de font i memòria cau separats. `npm run dev` permet provar les rutes amb les fonts reals en http://127.0.0.1:8766. `dist/` no es versiona.

La consulta i la navegació funcionen sense JavaScript. En les quatre competicions activades, un script ES5 recarrega cada 30 segons i permet pausar amb `auto=0`. Un punt roig fix identifica els marcadors en joc; no apareix en dades antigues. La recàrrega s'ajorna mentre la pestanya estiga oculta. Les pàgines de demostració conserven la prova de recàrrega única als 60 segons.

## Lliga Endesa masculina i femenina

- ACB: https://www.acb.com/es/liga/partidos i https://www.acb.com/es/liga/clasificacion. Es lligen únicament les dades JSON de l'HTML oficial, resolent les referències dels equips. Les jornades es consulten pels identificadors publicats per ACB; no es calculen per aproximació. El directe usa l'estat i el quart publicats; no s'inventa un rellotge.
- LF Endesa: https://beta.competiciones.feb.es/lf-endesa/clasificacion i els serveis públics que usa aquest portal. La categoria, la temporada i els identificadors dels serveis es descobreixen des dels recursos oficials. Es combina el calendari de temporada amb el servei actualitzat per rang de dates i l'overview de directe, filtrat per categoria i partit. El calendari base, tot sol, no conté tots els resultats.

La classificació indica expressament a quina jornada correspon, perquè pot ser anterior a la jornada de pròxims partits seleccionada. En la femenina es consulta la classificació històrica seleccionada quan la font la publica. Els horaris de la FEB es converteixen des d'Europe/Madrid respectant l'horari d'estiu i d'hivern. Els partits ajornats o sense marcador vàlid no es presenten com a 0–0 ni es declaren en joc només per l'hora prevista.

Les respostes d'ACB i FEB tenen una memòria cau de 20 segons, amb conservació de l'última resposta vàlida fins a 6 hores si falla la font. La font pot publicar dades amb retard; es mostra l'hora de consulta, no una garantia de latència. La lectura de l'HTML oficial rebutja scripts executables i accepta només estructures de dades.

## Fonts d'Eurolliga

- Calendari: `https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games`
- Directe: `https://live.euroleague.net/api/Header?gamecode=58&seasoncode=E2026` (codi del partit variable).
- Classificació: `https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/rounds/6/standings` (jornada variable).

EuroCup usa les mateixes rutes amb competició `U` i temporada `U2026`. Les classificacions es mostren en taules independents per grup, ordenades segons la font oficial. El grup de cada partit s'indica al costat de la data. Els enllaços externs apunten al Game Center i la classificació d'EuroCup.

El codi de temporada es calcula amb inici al juliol. La jornada inicial és l'última que ha començat; es pot seleccionar una altra jornada amb el formulari. El calendari té una memòria cau de 5 minuts, els marcadors de 15 segons i la classificació d'1 minut. La pàgina HTML pot conservar-se fins a 10 segons en la CDN.

La memòria cau regional de Vercel conserva l'última resposta vàlida si falla la font; és efímera i no garantix persistència. Si no hi ha marcador vàlid, es mostra «Marcador no disponible», mai un 0–0 inventat. Les dades antigues mostren un avís i l'hora original de consulta. La classificació conserva l'ordre oficial i no incorpora artificialment els partits en joc.

Aquests recursos estan disponibles sense credencials en la comprovació inicial; no s'ha verificat un acord de servei ni una llicència general de redistribució. Si el proveïdor restringix l'accés, caldrà adaptar la integració a les condicions que establisca. No s'envien consultes a les fonts esportives des de l'iPad.

## Validació en el dispositiu

1. Obrir l'URL pública en Safari de l'iPad i comprovar HTTPS.
2. Entrar en una competició i llegir les taules en vertical i horitzontal.
3. Provar els enllaços a resultats, classificació i inici.
4. Recarregar manualment i activar/desactivar la recàrrega opcional.
5. Comprovar la navegació amb JavaScript desactivat.

La verificació en un navegador modern no substituïx aquesta prova en l'iPad.

## Següents passos

Provar el directe en l'iPad real i integrar progressivament la resta de competicions amb les seues fonts oficials.
