# Bàsquet al dia

Web lleugera de resultats i classificacions per a Safari en iOS 12.5.8.

- Web pública: https://web-resultats.vercel.app
- Repositori: https://github.com/AndreuJG/web_resultats
- Projecte Vercel: `web-resultats`.

## Publicació

La carpeta local està vinculada amb `AndreuJG/web_resultats` i amb el projecte `web-resultats` de Vercel. Els canvis enviats a `main` es publiquen automàticament en la web de producció. Vercel genera les pàgines amb `npm run build` i publica `dist/`.

## Estat

**Eurolliga i EuroCup masculines activades amb dades oficials**: resultats de la jornada, marcadors en directe, quart, temps restant i classificació. Les altres cinc competicions encara mostren dades fictícies.

Inclou Lliga Endesa masculina, Lliga Femenina Endesa, Eurolliga masculina i femenina, EuroCup masculina, Basketball Champions League i Tercera FEB E-A (antiga EBA).

## Desenvolupament

Requisit: Node.js 22 o posterior. L'única dependència de producció és `@vercel/functions`, per a la memòria cau del servidor.

```sh
npm ci
npm run build
npm test
npm run dev
```

El generador `scripts/build.js` escriu les pàgines estàtiques en `dist/`. Eurolliga i EuroCup es generen al servidor amb `api/eurolliga.mjs` i `api/eurocup.mjs`, servides també en `/eurolliga.html` i `/eurocup.html`. Comparteixen servei i plantilla, amb temporada, rutes i memòria cau separades per competició. `npm run dev` permet provar les rutes amb les fonts reals en http://127.0.0.1:8766. `dist/` no es versiona.

La consulta i la navegació funcionen sense JavaScript. En Eurolliga i EuroCup, un script ES5 recarrega cada 30 segons i permet pausar amb `auto=0`. Un punt roig fix identifica els marcadors en joc; no apareix en dades antigues. La recàrrega s'ajorna mentre la pestanya estiga oculta. Les pàgines de demostració conserven la prova de recàrrega única als 60 segons.

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
