# ARIANE — prototype initial

Interface web et backend Node.js, sans clé secrète dans le dépôt.

## Endpoints
- `GET /health` : état du service et configuration IA.
- `POST /api/analyze` avec `{"input":"..."}` : analyse par l'API OpenAI si `OPENAI_API_KEY` est configurée.

## Démarrage local
Prérequis : Node.js 20+.
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:3000`.

## Variables d'environnement
- `OPENAI_API_KEY` : à définir uniquement dans les secrets de l'hébergeur.
- `OPENAI_MODEL` : facultatif, défaut `gpt-4o-mini`.
- `PORT` : facultatif, défaut `3000`.

Ne publie jamais une vraie clé API dans GitHub ou dans le navigateur. L'API peut être facturée séparément de l'abonnement ChatGPT : vérifie les tarifs et fixe des limites de dépenses avant de l'activer.

## Déploiement
Il faut un hébergeur qui exécute Node.js; GitHub Pages seul ne peut pas exécuter `server.js`. Vérifie les limites et la tarification actuelles de l'hébergeur avant de déployer. Définis les variables secrètes dans son tableau de bord, puis teste `/health`.

## Limites
Prototype de départ, non audité en sécurité et sans authentification ni limitation de débit. Ne l'expose pas publiquement avec une clé API avant d'ajouter ces protections. Les analyses sont à vérifier; ce prototype ne constitue pas une validation scientifique d'IFH-TEC.
