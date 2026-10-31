# Treballar amb agents en aquest projecte

Continua en el xat principal d'aquest projecte i demana els canvis amb normalitat.
L'agent principal conserva les decisions, implementa, integra i t'entrega el resultat.
Les instruccions d'`AGENTS.md` demanen que delegue quan la tasca ho justifique.
No has de crear xats ni repartir tu la faena.

## Quan es delega

- Un canvi menut de text o presentació: habitualment un sol agent.
- Una font que canvia de format: `fonts_oficials` investiga mentre el principal prepara la correcció.
- Una regressió de directe, memòria cau o filtres: el principal implementa i `revisor` comprova el canvi quan està preparat.
- Una ampliació de competició: investigació i treball independent en paral·lel; revisió després d'integrar.

Hi ha com a màxim dos subagents simultanis per instrucció del projecte. Els rols
de suport no editen fitxers: el principal concentra les edicions per evitar conflictes.
Els models s'hereten del principal; no hi ha un model concret fixat en els rols.
La delegació consumix tokens addicionals i només s'usa si aporta valor.

## Què pots escriure

- «Afig aquesta competició mantenint el funcionament actual.»
- «Revisa per què el marcador de l'ACB torna arrere.»
- «Comprova aquest canvi amb un agent revisor.»
- «Per a aquest retoc treballa amb un sol agent.»

Pots corregir l'objectiu o les preferències en qualsevol moment en el mateix xat.
El principal t'explicarà el resultat conjunt i les comprovacions pendents.
Els subagents no treballen en segon pla després d'acabar la petició ni creen
monitoratge periòdic; això requeriria una tasca expressa diferent.

## Fitxers i compatibilitat del client

- `AGENTS.md`: context del projecte, criteris de delegació i regles comunes.
- `.codex/agents/fonts_oficials.toml`: rol d'investigació.
- `.codex/agents/revisor.toml`: rol de revisió.

Les versions de Codex que admeten agents personalitzats poden descobrir aquests
TOML en carregar el projecte. En un xat ja obert, el principal pot llegir les
instruccions i passar-les a un subagent genèric amb les eines disponibles: no cal
dependre que el client recarregue la configuració durant la conversa.
Si no hi ha eines de subagents, el principal ho indica i continua individualment.
Les instruccions de lectura dels rols no creen un sandbox separat.

En aquest xat s'han llegit les instruccions durant la preparació. En un altre xat
del mateix projecte, Codex carrega `AGENTS.md` segons les seues regles de descoberta.
La disponibilitat d'eines i les polítiques del client continuen tenint prioritat.

No s'han afegit agents al servidor de la web ni processos periòdics. Aquesta
configuració organitza el desenvolupament. Un push a `main` continua activant el
desplegament automàtic existent. L’usuari ha autoritzat publicar els canvis validats
del projecte sense confirmació addicional, llevat que indique el contrari.

Referències: [subagents de Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents)
i [instruccions AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
