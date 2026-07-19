# Prospection WhatsApp

Un seul outil web (`index.html` + `style.css` + `script.js`) qui enchaîne les 3 étapes :

1. **Recherche** — trouve des établissements par ville/catégorie via OpenStreetMap (gratuit, sans clé API), ou importe un fichier Excel/CSV existant.
2. **Message** — choisis les colonnes (nom, téléphone, adresse...), écris ton message avec des variables `{{Nom}}`, `{{Adresse}}`, etc., et vérifie l'aperçu.
3. **Envoi WhatsApp** — génère un lien WhatsApp personnalisé par contact ; un clic ouvre WhatsApp avec le message déjà rempli, il ne reste qu'à cliquer "Envoyer". Une case à cocher permet de suivre qui a déjà été contacté.

## Utilisation

Ouvre simplement `index.html` dans ton navigateur (double-clic). Aucune installation nécessaire, tout tourne dans la page.

**Astuce numéros** : dans l'étape "Colonnes", le champ *Indicatif pays* (213 par défaut pour l'Algérie) convertit automatiquement les numéros locaux (`0555 12 34 56`) au format international requis par WhatsApp (`213555123456`). Sans ça, les liens WhatsApp ne fonctionnent pas pour des numéros locaux.

## Script Python (optionnel, autonome)

`app_sans_site_web.py` est une version alternative en Tkinter (fenêtre de bureau) qui ne fait que la recherche OSM + export Excel, sans l'édition de message ni l'envoi WhatsApp. Elle n'est pas nécessaire si tu utilises l'outil web ci-dessus.

```
pip install requests openpyxl
python app_sans_site_web.py
```
