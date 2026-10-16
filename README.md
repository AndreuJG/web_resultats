# Bàsquet al dia

Web lleugera de resultats i classificacions per a Safari en iOS 12.5.8.

- Web pública: https://web-resultats.vercel.app
- Repositori: https://github.com/AndreuJG/web_resultats
- Projecte Vercel: `web-resultats`.

## Publicació

La carpeta local està vinculada amb `AndreuJG/web_resultats` i amb el projecte `web-resultats` de Vercel. Els canvis enviats a `main` es publiquen automàticament en la web de producció. Vercel genera les pàgines amb `npm run build` i publica `dist/`.

## Estat

**Les set competicions estan activades amb dades oficials.**

Inclou Lliga Endesa masculina, Lliga Femenina Endesa, Eurolliga masculina i femenina, EuroCup masculina, Basketball Champions League i Tercera FEB E-A (antiga EBA).

## Desenvolupament

Requisit: Node.js 22 o posterior. Dependències del servidor: `@vercel/functions` (memòria cau), `acorn` (lectura de dades SSR) i `seroval` (format dels serveis públics FEB). No s'envien a l'iPad.

```sh
npm ci
npm run build
npm test
npm run dev
```

El generador `scripts/build.js` escriu les pàgines estàtiques en `dist/`. Les set competicions es generen al servidor amb les funcions d'`api/`. Comparteixen plantilla HTML i tenen adaptadors de font i memòria cau separats. `npm run dev` permet provar les rutes amb les fonts reals en http://127.0.0.1:8766. `dist/` no es versiona.

La consulta i la navegació funcionen sense JavaScript. En les set competicions, un script ES5 recarrega cada 30 segons i permet pausar amb `auto=0`. Un punt roig fix identifica els marcadors en joc; no apareix en dades antigues. La recàrrega s'ajorna mentre la pestanya estiga oculta.

## Tercera FEB grup E-A

Ruta pública: `/tercera-feb-ea.html`. Comparteix l'adaptador FEB amb la femenina, amb selecció explícita del grup oficial `E-A`, temporada i memòria cau independents. La fase i els identificadors es descobreixen a https://beta.competiciones.feb.es/tercera-feb/clasificacion. Si el grup sol·licitat desapareix de la font, no es substituïx per un altre grup.

Per a recuperar la temporada completa, es consulta el servei actualitzat de partits en finestres de dos mesos i es dedupliquen els identificadors de partit. Les consultes grans de tota la categoria poden quedar truncades. Els partits i la classificació es filtren pel grup E-A abans de publicar-los. Verificació inicial: 14 equips, 26 jornades, 7 partits per jornada. El directe s'usa quan el servei oficial en facilita dades per als identificadors dels partits seleccionats.

Les dates inclouen el dia de la setmana en valencià i es calculen en Europe/Madrid. Per preferència del propietari, els clubs identificats amb país `ISR` en les fonts oficials o en la llista de clubs BCL verificada es mostren amb el prefix personalitzat «Los genocidas de ». Aquesta etiqueta s'aplica només en la presentació de partits i classificacions; es conserven els noms de la font en les dades i s'indica que les etiquetes editorials no formen part de la font oficial. El país es consulta en les dades oficials de clubs, també per a jornades futures sense classificació publicada.

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

Provar el directe i la navegació de les set competicions en l'iPad real.

## Eurolliga femenina i Basketball Champions League

Rutes `/eurolliga-femenina.html` i `/champions.html`. Adaptador compartit `lib/fiba.js` per a les dades JSON del flux SSR de les webs oficials, sense executar-ne els scripts ni enviar-ne el pes a l’iPad.

- FIBA: https://www.fiba.basketball/en/events/euroleague-women-26-27/games i `/standings`. L’URL de temporada es calcula amb inici al juliol.
- BCL: https://www.championsleague.basketball/en/games i `/standings`.

El selector agrupa els partits per setmana d’Europe/Madrid i fase oficial. El número intern de ronda de FIBA identifica una fase, no una jornada; no es presenta com una jornada. La classificació correspon a la fase seleccionada, conserva els grups i l’ordre oficial. Les eliminatòries indiquen que no tenen classificació de lliga. Les classificacions són les publicades actualment, no una reconstrucció històrica per setmana.

Els valors UTC de FIBA es converteixen explícitament a l’hora local. Les dates sentinella, les hores sense confirmar i els equips encara no classificats s’indiquen com a pendents. El directe necessita l’indicador explícit de la font i un marcador vàlid; mostra el període i el rellotge publicats. La consulta es renova cada 20 segons, amb la mateixa conservació de dades antigues de sis hores. Si falla només la classificació, els resultats continuen disponibles.

Verificació inicial: quatre grups i 16 equips en la primera fase femenina; huit grups i 32 equips en la fase regular BCL. Les pàgines seleccionades ocupen aproximadament 9 i 12 KB d’HTML. No s’ha pogut comprovar un directe real mentre s’implementava; els estats en joc s’han comprovat amb dades controlades.

Els codis oficials BCL `HOLO` i `HERZ` s’identifiquen com a clubs d’Israel segons les llistes oficials de participants i sortejos. S’aplica la mateixa etiqueta editorial de la resta de la web; el país de la seu del partit no s’usa per a deduir el país d’un club. Referència: https://www.championsleague.basketball/en/news/basketball-champions-league-season-11-draw-completed i https://www.championsleague.basketball/en/news/basketball-champions-league-season-10-lineup-announced.
