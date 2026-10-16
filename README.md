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

La consulta i la navegació funcionen sense JavaScript. En les set competicions, un script ES5 canvia de jornada en seleccionar-la i adapta les recàrregues als partits i permet pausar amb `auto=0`. Un punt roig fix identifica els marcadors en joc; no apareix en dades antigues. La recàrrega es cancel·la mentre la pestanya estiga oculta i només es recupera en tornar-hi.

## Tercera FEB grup E-A

Ruta pública: `/tercera-feb-ea.html`. Comparteix l'adaptador FEB amb la femenina, amb selecció explícita del grup oficial `E-A`, temporada i memòria cau independents. La fase i els identificadors es descobreixen a https://beta.competiciones.feb.es/tercera-feb/clasificacion. Si el grup sol·licitat desapareix de la font, no es substituïx per un altre grup.

Per a recuperar la temporada completa, es consulta el servei actualitzat de partits en finestres de dos mesos i es dedupliquen els identificadors de partit. Les consultes grans de tota la categoria poden quedar truncades. Els partits i la classificació es filtren pel grup E-A abans de publicar-los. Verificació inicial: 14 equips, 26 jornades, 7 partits per jornada. El directe s'usa quan el servei oficial en facilita dades per als identificadors dels partits seleccionats.

Les dates inclouen el dia de la setmana en valencià i es calculen en Europe/Madrid. Per preferència del propietari, els clubs identificats amb país `ISR` en les fonts oficials o en la llista de clubs BCL verificada es mostren amb el prefix personalitzat «HP ». Aquesta etiqueta s'aplica només en la presentació de partits i classificacions; es conserven els noms de la font en les dades i s'indica que les etiquetes editorials no formen part de la font oficial. El país es consulta en les dades oficials de clubs, també per a jornades futures sense classificació publicada.

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

## Recàrrega adaptativa

La política compartida `lib/refresh-policy.js` usa els partits de la jornada o setmana seleccionada: 30 segons amb directe confirmat; un minut des de 15 minuts abans de l’inici previst fins a sis hores després mentre no es confirme el resultat; com a màxim 15 minuts en la resta de casos. Si s’acosta un partit abans del següent interval, avança la comprovació. Amb totes les dades vàlides i tots els partits finalitzats, la consulta queda en mode manual. Les dades antigues es tornen a intentar al minut. Una hora desconeguda no s’interpreta com a inici imminent.

Els temporitzadors només funcionen en la pestanya visible. En tornar a una pàgina amb el termini vençut, s’actualitza una vegada; si encara no ha vençut, conserva el temps restant. No hi ha cron ni consultes periòdiques independents de visites. Cada pestanya té el seu temporitzador; la memòria cau del servidor pot compartir respostes entre visites. Sense JavaScript, continua disponible l’actualització manual.

## Agenda de televisió i navegació

`/televisio.html` mostra les emissions anunciades durant les pròximes 168 hores, ordenades per hora, amb color i nom de competició. Fonts: catàlegs oficials Movistar per als dos tipus de subscripció, fitxes d’emissió per a particulars, guia de directes Movistar (inclou TV pública i dials; s’exclouen canals BAR) i canals publicats en el calendari ACB (DAZN, Movistar i autonòmiques). Les repeticions sense anunci de futura emissió en directe no s’incorporen. Els catàlegs es paginen seguint els enllaços oficials, amb un màxim de tres pàgines per catàleg. Les fitxes pendents de canal i els dials no publicats es mostren explícitament. La cobertura dels últims dies pot ser incompleta; mai s’inferix un canal només pels drets de tota una competició.

Es combinen anuncis del mateix partit a la mateixa franja (marge de 30 minuts per als previs), conservant els canals confirmats. No es mesclen fases ni competicions conegudes diferents. Els horaris són d’emissió i poden incloure el previ. La pàgina consulta una agenda en memòria cau d’una hora i la CDN conserva HTML cinc minuts; no hi ha cron. La recàrrega visible és de 15 minuts i no consulta les fonts esportives cada vegada.

La jornada es canvia amb l’esdeveniment `change` d’un selector natiu i s’envia el formulari GET, compatible amb Safari iOS 12. Sense JavaScript continua disponible el botó Mostra. Els enllaços Anterior i Següent respecten l’ordre de les jornades/fases publicades i conserven `auto=0`.

Els resultats finalitzats del CB Tabernes Blanques en Tercera FEB E-A inclouen un enllaç al marcador i un altre «Estadístiques FEB», amb la ruta clàssica oficial `https://baloncestoenvivo.feb.es/partido/{idPartido}`. S’obri en la mateixa pestanya i permet tornar amb Enrere. Es conserva la navegació completa de la federació; no s’incrusta el seu visor en l’iPad. Partit inicial verificat: https://baloncestoenvivo.feb.es/partido/2537572.

## Presentació compacta

La portada mostra els accessos sense avisos d’activació ni explicacions de recàrrega. La recàrrega adaptativa continua activa amb les dades del temporitzador en un element ocult; els controls són Actualitza ara, Pausa i Reprén. Els avisos d’error o de dades antigues es conserven quan realment es produïxen.

En Eurolliga, EuroCup, Eurolliga femenina i BCL, els equips amb país ESP es mostren en negreta en resultats i classificacions. Euroleague Basketball publica el país en els clubs. En les dades FIBA sense país, s’identifiquen pels codis de club dins de cada competició: ELW ZARAG/VBC/GIR i BCL UCAM/UNI/SBB/AJB. La identificació és específica de competició: el codi FCB de Flammes Carolo en ELW no s’interpreta com FC Barcelona. Referències de participants: https://www.fiba.basketball/en/events/euroleague-women-26-27 i https://about.fiba.basketball/en/news/basketball-champions-league-season-11-lineup-announced.

L’agenda exclou NBA i WNBA abans de consultar les fitxes individuals i també en recuperar dades de la memòria cau.

La web clàssica s’ha localitzat seguint el marcador de https://competiciones.feb.es/estadisticas/resultados/8/2026: `Partido.aspx?p=2537572` redirigix a `/partido/2537572` i conserva el mateix identificador de partit. La navegació Ficha / Estadísticas funciona en el navegador de comprovació; el visor pot tardar a carregar. No s’ha pogut certificar la compatibilitat real del visor extern amb l’iPad iOS 12.5.8.

## Estadístiques lleugeres i agenda per dies

`/estadistiques-feb.html?partit=2537572&jornada=1` genera HTML al servidor a partir del servei BoxScore del visor públic clàssic FEB. El servidor obté la sessió pública del visor des de la fitxa oficial i la conserva únicament en memòria durant cinc minuts; mai la retorna a l’iPad, al repositori, als logs ni a la memòria cau persistent. Si caduca, la renova una vegada. Es valida la competició Tercera FEB, el grup E-A i la identitat del club Tabernes Blanques abans de mostrar dades.

La vista simple inclou minuts, punts, rebots, assistències i valoració; «Tirs i detall» afegix llançaments, recuperacions, pèrdues, taps, faltes i +/−. Es mostren els totals oficials i els parcials. Els camps buits es mostren amb un guió. La memòria cau dura 20 segons i conserva l’última resposta vàlida sis hores en cas d’error, amb hora de consulta original i sense pilot roig. La recàrrega adaptativa compartida usa 30 segons amb estat oficial en joc i s’atura quan ha acabat. Sense visita no hi ha sondeig. Encara falta comprovar un directe real de Tabernes mentre es juga.

Els marcadors de Tabernes finalitzats o en joc enllacen a aquesta pàgina lleugera, amb la jornada i la pausa de recàrrega conservades. «Fitxa oficial FEB» manté accés a tota la navegació de la federació. La taula detallada permet desplaçament horitzontal; no s’envien imatges, biblioteques ni visors externs a l’iPad.

Els controls de navegació tenen fons transparent i vora discreta amb àrea tàctil de 44 px. TV és una entrada de la mateixa llista que les competicions, amb fons suau. L’agenda ordena les emissions i crea una taula independent per dia d’Europe/Madrid, amb l’hora en la primera columna.

## Memòria cau de Tercera FEB E-A

El calendari complet es reutilitza durant 12 hores. Les jornades acabades es comproven de nou després de 24 hores; les futures, després de 12 hores. Des de dues hores abans de qualsevol partit pendent i fins a sis hores després de l’inici, o amb directe confirmat, la memòria cau de la jornada dura 20 segons. Un marcador pendent més antic es reintenta als 15 minuts. La pàgina sense jornada explícita caduca com a màxim a les sis hores i abans quan s’acosta el següent partit. Si falta la classificació, es reintenta al minut.

Vercel Runtime Cache conserva les entrades fins a 14 dies per a poder mostrar l’última resposta mentre `waitUntil` renova la jornada en segon pla. Les dades caducades mantenen l’hora original i es marquen com a antigues. La CDN conserva l’HTML com a màxim una hora, limitada pel termini de renovació de la jornada; durant el directe, com a màxim 20 segons. No hi ha cron: només es consulta amb visites. És memòria cau compartida i evictable, no arxiu permanent; una primera consulta sense dades guardades encara ha d’esperar la FEB. La resta de competicions i les estadístiques conserven la seua política anterior.

## Seleccions espanyoles

`/seleccio-masculina.html` i `/seleccio-femenina.html` usen `lib/national.js` amb els calendaris i classificacions FIBA. Fonts inicials: classificació europea al Mundial masculí 2027, classificació a l’EuroBasket femení 2027 i Mundial femení 2026. Les competicions es declaren amb el seu codi oficial i gènere; per a nous cicles cal actualitzar aquest catàleg, que no inventa amistosos ni tornejos encara no publicats.

El selector tria competició/fase, i els resultats es filtren per codi ESP. La classificació mostra només el grup d’Espanya de la fase seleccionada, amb tots els seus equips. S’utilitzen els identificadors oficials de seleccions; no es confonen amb clubs que reutilitzen codis. Per defecte s’obri una fase amb directe o amb el pròxim partit anunciat; si no hi ha futurs, l’última disputada. La capçalera mostra el torneig real, perquè les fases classificatòries poden abastar diversos anys.

Les fonts es consulten a demanda amb memòria cau de 20 segons i conservació de dades antigues fins a sis hores. La televisió reconeix anuncis de selecció masculina/femenina i usa colors específics, sense suposar canals pels drets. Si un anunci no especifica el gènere, es conserva l’etiqueta genèrica «Selecció espanyola». No es mostren com a partits d’Espanya les emissions d’altres seleccions.

En Tercera FEB E-A, Tabernes Blanques es destaca en negreta tant als marcadors com a la classificació. En les estadístiques, Manu Aroca es reconeix per l’identificador FEB 1467686 i pels noms Manu/Manuel/M. Aroca Rubio; el seu nom apareix en negreta en vista simple i detallada.
