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

Els temporitzadors només funcionen en la pestanya visible. En tornar a una pàgina amb el termini vençut, s’actualitza una vegada; si encara no ha vençut, conserva el temps restant. El directe no fa consultes periòdiques independents de visites; l’arxiu FEB té la revisió diària descrita més avall. Cada pestanya té el seu temporitzador; la memòria cau del servidor pot compartir respostes entre visites. Sense JavaScript, continua disponible l’actualització manual.

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

## Arxiu permanent de Tercera FEB E-A i LF Endesa

`data/tercera-feb.json` i `data/lf-endesa.json` són els arxius versionats de totes les jornades i temporades de cada competició, separats i validats pel seu codi oficial. No caduca, no depén de Runtime Cache i es desplega amb l’aplicació. Una jornada només queda tancada quan tots els marcadors són finals i hi ha classificació oficial vàlida. Les jornades tancades no es tornen a consultar ni se sobreescriuen; qualsevol correcció excepcional es pot fer explícitament en aquest fitxer, conservant-ne l’historial Git.

Les jornades futures es mostren directament des del calendari guardat. Des de dues hores abans del primer partit pendent, la pàgina torna a l’adaptador dinàmic FEB amb memòria cau curta (20 segons prop del partit o amb directe confirmat). No depén del dia de la setmana: també funciona si es juga entre setmana. Les estadístiques mantenen el seu adaptador dinàmic independent.

`npm run archive:feb` i `npm run archive:lf` revisen només les jornades obertes i conserva literalment les tancades. Reutilitza les dades antigues dels partits tancats en el calendari i comença les consultes de dates en el primer partit pendent. Guarda el fitxer atòmicament només si acaba correctament. Un error de la FEB no reemplaça l’arxiu vàlid. Les temporades anteriors es conserven en el JSON; la navegació de la web continua mostrant la temporada actual.

El workflow `.github/workflows/archive-feb.yml` executa la revisió diària a les 02:17 UTC (04:17 en horari d’estiu i 03:17 en horari d’hivern d’Europe/Madrid), guarda els canvis en GitHub i activa el desplegament habitual. També es pot executar manualment des d’Actions. Si una font falla, es conserva el seu arxiu anterior, es guarda la revisió de l’altra si ha funcionat i el workflow indica la incidència. Aquesta revisió diària funciona sense visites; el sondeig del directe continua depenent de les visites. Si la revisió falla i el calendari pendent supera set dies, una visita pot recuperar dades de la font oficial. Les jornades tancades continuen llegint-se de l’arxiu encara que la FEB no responga.

La CDN pot guardar l’HTML una hora com a màxim, amb caducitat reduïda quan s’acosta el partit. La memòria cau temporal i la renovació en segon pla es mantenen com a suport per als partits en joc. No cal contractar ni connectar una base de dades externa.

## Fonts FEB clàssiques i recuperació d’errors

Tercera FEB E-A i LF Endesa consulten per defecte el visor clàssic oficial `baloncestoenvivo.feb.es`: resultats i classificació de la jornada, amb selecció WebForms validada per temporada, grup i identificador de jornada. El calendari complet es llig una vegada des de la pàgina clàssica. `competiciones.feb.es/estadisticas/` és la segona ruta de lectura quan la primera falla. L’adaptador beta anterior es conserva només per a diagnòstic; la web i l’arxiu diari no el criden.

Els marcadors en viu es consulten en el servei públic `https://intrafeb.feb.es/LiveStats.API/api/v1/overview` que utilitza el visor FEB. El servidor obté la sessió pública del visor i la manté només en memòria. No envia la sessió ni els formularis WebForms a l’iPad, als logs ni a la memòria cau persistent. La unió requerix identificador exacte de partit, competició i identitat dels dos equips. Els estats numèrics oficials 1/2/3 indiquen pendent/en joc/final. Els 0-0 previs no es presenten com a resultat final.

Les dos lectures (resultats i directe) són independents. Si falla una, es conserva la informació vàlida de l’altra. Si falla tota la font, una instància acabada d’arrancar també pot mostrar la jornada de l’arxiu permanent amb la seua hora original i l’avís de dades antigues. Un marcador antic no mostra el pilot de directe. Els resultats finals acabats de publicar no són reemplaçats per un directe antic en memòria cau. Les dades de recuperació es tornen a intentar després de 20 segons de memòria cau; no queden congelades com si foren noves.

L’arxiu diari exigix una resposta oficial renovada: una jornada recuperada de l’arxiu antic no es torna a guardar amb data nova. La font clàssica aporta també l’hora real dels partits finalitzats, que es conserva quan el calendari general només mostra el marcador. Un error en LF Endesa no impedix guardar Tercera FEB, i el workflow informa de la incidència.

## Consultes separades de resultats i classificacions

ACB conserva durant 24 hores els partits finalitzats de jornades explícites; les jornades pendents es revisen com a màxim cada hora i passen a 20 segons des de dues hores abans de qualsevol partit fins a sis hores després mentre continue pendent, o amb directe oficial. La ruta sense jornada explícita dura com a màxim un minut per a detectar el canvi de jornada. La classificació actual té una entrada separada d’un minut: consultar una jornada antiga no congela la classificació present.

Eurolliga femenina i BCL comparteixen una única lectura del calendari complet entre totes les setmanes, amb la mateixa detecció d’inici basada en tots els partits de la competició. La classificació de cada fase es conserva separadament durant un minut. El calendari complet es revisa com a màxim cada hora; els partits amb data o hora desconeguda, com a màxim cada cinc minuts. Les eliminatòries sense taula oficial continuen sense classificació inventada.

Els resultats i les classificacions conserven per separat l’hora real de consulta i l’estat de dades antigues. Una classificació renovada no fa passar un marcador antic per nou. Quan falla una font, es mostra l’última resposta oficial vàlida disponible identificada com a antiga. Una classificació antiga també activa un reintent de la pàgina al minut, inclús amb els partits finalitzats. No es crea cap sondeig independent de visites fora de la revisió diària dels arxius FEB. Eurolliga masculina, EuroCup i seleccions conserven els seus adaptadors actuals.

## Seleccions: classificatoris 2027

`/seleccio-masculina.html` mostra tot el classificatori **europeu** al Mundial masculí 2027 (FIBA `WCQ-EUR`); `/seleccio-femenina.html` mostra tot el classificatori a l’EuroBasket femení 2027 (`EMSW-Q`). El Mundial femení 2026 queda retirat del catàleg i no es consulta. Es validen torneig, codi, gènere, tipus de seleccions i edició FIBA 2027 abans de guardar cap resposta. El cicle començat el 2025 no es confon amb una temporada de clubs 2025–26.

Es mostren tots els partits i classificacions de la fase seleccionada. Els enllaços `grup=A`, etc. filtren alhora marcadors i classificació, comparteixen la mateixa font guardada i identifiquen el grup d’Espanya. Espanya apareix en negreta, i cada partit indica el seu grup. La navegació de fase torna a tots els grups; actualitzar i pausar conserven el filtre actual. Les fases i els grups funcionen amb HTML sense JavaScript addicional.

La femenina separa primera fase, grup d’amfitriones i segona fase. El calendari paral·lel de les amfitriones no bloqueja la selecció automàtica de la fase classificatòria; Espanya entra en la segona fase. La regla compartida conserva una fase jugada fins al dia següent i després avança a la següent. Les taules corresponen sempre a la fase triada.

Regles verificades en FIBA:

- [Mundial masculí 2027 · Europa](https://www.fiba.basketball/en/events/fiba-basketball-world-cup-2027-european-qualifiers/how-to-qualify-for-the-world-cup): els tres primers de cadascun dels huit grups de quatre passen a segona fase; els tres primers de cadascun dels quatre grups de sis van al Mundial.
- [EuroBasket femení 2027](https://www.fiba.basketball/en/events/fiba-womens-eurobasket-2027-qualifiers/how-to-qualify): els dos primers de cada grup i els tres millors tercers passen a segona fase. Els tercers només porten marca **condicionada**, perquè es comparen sense resultats contra els quarts, incloent el grup de tres equips. Els dos primers de cada grup de segona fase van a l’EuroBasket. Bèlgica, Finlàndia, Lituània i Suècia tenen plaça assegurada com a amfitriones; el seu grup no es presenta com una lluita per dos llocs.

Les fonts completes de calendari es comparteixen entre fases i grups, amb caducitat adaptada als partits (20 segons prop del directe, fins a una hora quan estan lluny). La classificació es renova independentment cada minut quan es consulta. Les còpies de reserva es conserven fins a 30 dies, sense canviar-ne l’hora original, i una classificació renovada no fa passar un marcador antic per nou. El filtre no provoca consultes noves si la font ja està vigent. La televisió manté el reconeixement dels anuncis d’Espanya masculins/femenins i els seus colors, sense suposar canals pels drets.

Verificació amb les dades oficials del 21/10/2026: masculina 168 partits (96 primera fase i 72 segona), amb huit i quatre grups; femenina 162 partits (78 primera fase, 12 amfitriones i 72 segona), amb set, un i sis grups. Les vistes completes ocupen aproximadament 23–33 KB d’HTML, i no cal afegir fonts per mostrar tots els grups.

En Tercera FEB E-A, Tabernes Blanques es destaca en negreta tant als marcadors com a la classificació. En les estadístiques, Manu Aroca es reconeix per l’identificador FEB 1467686 i pels noms Manu/Manuel/M. Aroca Rubio; el seu nom apareix en negreta en vista simple i detallada.


### Continuïtat quan falla una font

Les còpies de reserva d'ACB, FIBA i Euroleague es retenen fins a 30 dies a la memòria cau compartida; això no canvia la freqüència de consulta dels partits en viu. La memòria cau és prescindible i pot ser expulsada: l'històric permanent de FEB continua als JSON del repositori. Una instància amb dades locals caducades consulta si una altra ja ha guardat una còpia més recent.

ACB mostra els marcadors encara que la classificació no estiga disponible i reutilitza la primera lectura de resultats en una visita sense jornada seleccionada. Les renovacions d'ACB, FIBA i FEB poden continuar en segon pla: esperem fins a 1,5 segons per la resposta actualitzada abans de servir la còpia de reserva. Renovar en segon pla no es tracta com una fallada confirmada. Si la renovació falla, es conserva l'hora original i s'avisa que les dades són antigues; els marcadors antics no porten el pilot de directe. Els errors de font es registren amb la clau de consulta i, en les consultes HTML, el servidor, la durada i el codi de transport, sense credencials.


### Jornada inicial i classificació

Les lligues conserven la jornada disputada fins al dia següent de l'últim partit inclòs, segons el calendari de Madrid. Després mostren la següent jornada, encara que encara no haja començat. En dobles jornades d'Eurolliga masculina, el dijous ja es mostra la jornada de dijous/divendres i no es conserva un dia extra la de dimarts/dimecres. Un partit pendent traslladat més enllà de la jornada següent no bloqueja la portada i continua accessible a la seua jornada. Si hi ha partits en joc, tenen prioritat; abans de començar la temporada es mostra la primera jornada. Les pàgines inicials amb una jornada finalitzada comproven la següent com a màxim cada 15 minuts mentre la pestanya és visible.

La classificació és independent de la jornada de resultats seleccionada. ACB, Eurolliga i EuroCup utilitzen la classificació oficial més recent; FIBA utilitza la fase actual amb una taula publicada, conservant l'última fase de grups si la següent encara no té taula. En Eurolliga femenina, una selecció manual també conserva exclusivament la classificació de la fase triada; la vista automàtica manté l'última taula publicada i en mostra explícitament la fase al títol. Les fases de seleccions conserven el grup corresponent a la fase seleccionada. FEB reutilitza l'última classificació real arxivada i, durant partits, la de la jornada activa. El títol indica la jornada o fase de la classificació. Les dades històriques guardades no es modifiquen en consultar-les; les tasques d'arxiu continuen guardant la taula original de cada jornada.


### Directe de FIBA: Eurolliga femenina i Champions

L'HTML de FIBA pot conservar marcadors antics durant minuts: la pàgina oficial el serveix amb una política de memòria cau de 240 segons i actualitza els partits al navegador per una altra via. Per als partits en joc o pròxims a començar, consultem l'endpoint públic que usa el seu client: `/en/events/api/game-live-info/{id}/light`, en el domini oficial de cada competició. Validem el partit, el nom tècnic i les dues organitzacions, incloent l'ordre invers dels equips.

El calendari i la classificació continuen venint de les fonts anteriors. Els marcadors utilitzen una memòria cau pròpia de 15 segons i la pàgina conserva la recàrrega visible cada 30 segons. Els estats oficials 4, 5 i 999 es tracten com a partit acabat, sense pilot roig. Si falla el directe, es conserva l'últim marcador vàlid amb l'hora original i s'indica que és antic; un marcador antic de l'HTML no es presenta com a directe actual. No es requereixen claus, comptes nous ni connexions de l'iPad a websockets.

### Zones de classificació (2026–27)

`lib/standings-zones.js` declara únicament regles verificades, amb enllaç a la font oficial. Les marques indiquen la zona de la posició actual, sense calcular classificacions matemàtiques. Són HTML amb abreviatura, color i llegenda; no afegeixen JavaScript ni lectures de fonts. Es mantenen el taronja del València i les negretes dels equips.

| Competició / fase | Zones | Font |
| --- | --- | --- |
| Eurolliga masculina, fase regular | 1–6 playoff directe; 7–10 play-in | [Calendari i format oficial 2026–27](https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24407) |
| EuroCup masculina, fase regular | 1–4 de cada grup de 8 a octaus | [Nou format oficial 2026–27](https://mediacentre.euroleague.net/en/app/2/communication/communication/preview/24408) |
| ACB, fase regular | 1–8 playoff; 17–18 descens | [Taula i llegenda oficial ACB](https://www.acb.com/es/liga/clasificacion) |
| LF Endesa, fase regular | 1–8 playoff; 15–16 descens a LF Challenge | [Bases 2026–27, apartats 3.2.2 i 3.3, pàg. 13–14](https://www.feb.es/Documentos/Enlaces/%5B6536%5DBBCC%20LF%20ENDESA%2026-27%20-%20Versi%C3%B3n%20Web.pdf#page=14) |
| Tercera FEB E-A, fase regular | 1 eliminatòria entre primers; 2–4 eliminatòries d’accés a fase d’ascens; 12–14 descens a Primera Divisió masculina | [Bases 2026–27, apartats 1.2.2 i 1.3, pàg. 5–6 i 10](https://www.feb.es/Documentos/Enlaces/%5B6547%5DBBCC%20Tercera%20FEB%2026-27%20-%20Versi%C3%B3n%20Web.pdf#page=6) |
| Eurolliga femenina, primera fase | 1–3 segona fase; 4 EuroCup femenina | [Sistema oficial 2026–27](https://www.fiba.basketball/en/events/euroleague-women-26-27/competition-system-explained) |
| Eurolliga femenina, segona fase | 1–2 play-in de semifinals (plaça en Final Six); 3–4 play-in de quarts | Mateixa font |
| Champions, fase regular | 1 Top 16 directe; 2–3 play-in | [Sistema oficial 2026–27](https://www.championsleague.basketball/en/competition-system) |
| Champions, Top 16 | 1–2 quarts | Mateixa font |

Les regles són exclusives de la temporada indicada, amb comprovació de mida del grup, rangs complets i fase. FIBA conserva el nom original de la fase **de la classificació**, independent dels partits seleccionats; ACB identifica la seua taula regular de 34 jornades. Una temporada nova, fase desconeguda o taula parcial es mostra sense zones fins que es verifiquen les seues regles. Cal actualitzar aquesta configuració en canviar de temporada; no s'extrapolen les normes automàticament.

Les bases FEB facilitades per l’usuari s’han verificat en text i visualment, incloent les portades 2026/27. Tercera FEB diferencia el primer dels llocs 2–4: guanyar la lliga regular no dona ascens directe; primer hi ha eliminatòria entre primers, i després fase d’ascens. El supòsit del millor cinqué només afecta la conferència amb una quarta plaça, i no s’extrapola al grup E-A (el quadre de la pàgina 8 situa el quart representant en la conferència D). En la conferència E, els llocs 12–14 són descens esportiu segons l’apartat 1.3; l’apartat 1.4.5 regula ascensos i vacants procedents de Primera Divisió, no un playoff de descens. En LF Endesa, les places europees depenen del títol, la Copa i les places concedides per FIBA (3.4): no es pinten com a places fixes de la taula regular.

Per reconéixer les taules regulars FEB ja arxivades, es comproven competició, temporada, nom i mida del grup, i calendari complet de 30 o 26 jornades, sense reescriure els JSON permanents ni consultar cap font nova. Una fase explícita diferent de la regular no rep aquestes marques. **Seleccions: zones activades per als classificatoris 2027 indicats en l’apartat anterior**, després de rebre i verificar les fonts oficials facilitades per l’usuari. No s’apliquen a Tercera FEB les normes de les lligues autonòmiques FBCV ni es dedueix un descens en les competicions europees per ocupar les últimes posicions.


### Fases de l’Eurolliga femenina

El selector HTML agrupa les setmanes i eliminatòries en cinc blocs: fase prèvia, primera fase (grups A–D), segona fase (grups E–F), play-in i Final Six. Els noms «Semi-Final Path / Final Path» es mostren com a semifinals/finals de la **fase prèvia**, amb el camí corresponent. Els quarts, semifinals i final del torneig porten «Final Six»; els identificadors de les setmanes i els enllaços existents es conserven. No es presenten els identificadors d’emparellaments d’eliminatòries com si foren grups de lliga.

En seleccionar una fase manualment, només es mostra la seua classificació oficial. Una fase futura sense partits disputats no reutilitza l’ordre provisional de caps de sèrie com a classificació. La prèvia, el play-in i la Final Six indiquen que són eliminatòries sense taula de lliga. Quan existeix una taula actual d’una altra fase, s’hi ofereix un enllaç separat «Consulta la classificació actual», conservant la pausa si estava activada. Sense selecció manual, es manté l’última classificació disponible amb un títol que identifica clarament la fase, encara que els propers partits ja siguen de la següent. No hi ha consultes noves ni JavaScript addicional.
