# Conclusion générale et perspectives

Ce chapitre clot le rapport. Il récapitule ce qui a été livré pendant le stage, évalue ce que les campagnes de validation démontrent réellement, puis énonce les limites qui bornent ces résultats et les perspectives d'évolution du système.

---

## 6.1 Rappel du travail réalisé

Le stage portait sur le développement d'un **QA Testing Agent**, un outil qui transforme des user stories Jira en cas de tests Gherkin, puis en scripts Playwright exécutables, sans intervention manuelle de l'analyste.

Le système livré se compose de huit étapes enchaînées. Les deux premières extraient le ticket et son contenu ; la troisième génère les scénarios Gherkin à partir des critères d'acceptation ; la quatrième explore le site cible pour construire une base de sélecteurs ; la cinquième produit les scripts Playwright ; la sixième les exécute. Les deux dernières traitent les échecs : la septième les classe et en déduit une cause racine, la huitième propose une correction et — en mode ligne de commande seulement — l'applique avant de relancer le scénario.

Deux modes d'exécution cohabitent. Le **mode ligne de commande** va jusqu'au bout de la chaîne : il valide chaque proposition de correction, sauvegarde le script, applique le correctif et relance, jusqu'à trois fois. Le **mode API et interface web** s'arrête à la proposition : il affiche l'analyse et les corrections proposées, mais ne les applique pas. Cette différence n'est pas un défaut d'implémentation mais une frontière fonctionnelle assumée, exposée au chapitre 3 et analysée au chapitre 5.

Sur le plan technique, l'arbitrage central a porté sur le choix d'un orchestrateur écrit spécifiquement plutôt que sur un framework multi-agents. Ce choix, documenté dans `docs/architecture-review.md`, a été retenu pour trois raisons : le déterminisme, l'absence de dépendance supplémentaire, et la rejouabilité. Le rapport d'architecture distingue trois options (orchestrateur actuel, CrewAI, architecture hybride) et aboutit à la conclusion que le pipeline constitue un graphe orienté acyclique doté d'une seule boucle de reprise bornée, et non un système multi-agents.

---

## 6.2 Ce que les validations démontrent

Trois campagnes ont été exécutées, et leurs résultats doivent être lus avec la précision que le chapitre 5 a appliquée.

La première, portant sur le ticket SCRUM-1, a produit **trois tests réussis sur trois**, pour une durée de 712,9 secondes. Les deux scénarios d'échec attendu — mot de passe incorrect, adresse non enregistrée — confirment que le site rejette correctement une saisie invalide.

La deuxième campagne, sans appel à aucun modèle de langage, a produit **cinq tests réussis sur cinq** sur des parcours de navigation distincts. L'indépendance de cette campagne par rapport au générateur en fait une référence utile : elle valide les sélecteurs collectés par le module de compréhension du site, au-delà de la seule page de connexion.

La troisième, consignée dans `report.json`, a produit **deux réussites et deux échecs**. Les deux échecs partagent le même message d'erreur, qui nomme explicitement le sélecteur en cause. C'est précisément le type de situation que le module d'analyse est conçu pour traiter.

Ces résultats établissent trois choses.

**La chaîne complète fonctionne de bout en bout.** L'extraction Jira, la conversion du format ADF, la génération Gherkin, la compréhension du site, la génération Playwright et l'exécution s'enchaînent sans intervention. Aucun échec d'intégration n'a été observé entre ces étapes.

**Le module d'analyse d'échecs produit des diagnostics exploitables.** Les rapports de `failure-reports/` classent les échecs par catégorie et en déduisent une cause racine, avec un niveau de confiance et un raisonnement explicite. Le moteur est déterministe : il repose sur treize règles évaluées dans l'ordre, et la première dont les conditions sont satisfaites détermine la classification.

**La boucle de réparation est effective et bornée.** Les artefacts de `repair-history/` montrent que la boucle a été parcourue, et les indices s'arrêtent à `attempt-3` : la borne de trois tentatives n'a jamais été dépassée, et le mécanisme d'escalade a bien fonctionné.

Une précision de méthode s'impose cependant. Le rapport d'exécution de la campagne SCRUM-1 n'a pas été conservé ; cette campagne repose donc sur la lecture de l'interface et non sur un fichier de rapport. De même, la part exacte du délai d'attente entre scénarios dans la durée totale de 712,9 secondes n'a pas pu être établie. Ces deux points restent marqués comme à vérifier, et je les assume comme tels plutôt que de leur attribuer une valeur plausible mais non mesurée.

---

## 6.3 Limites du travail

Les limites observées au chapitre 5 se répartissent en trois familles.

Les **limites de conception** tiennent d'abord à la validation réduite à un seul domaine : la base de sélecteurs n'a été construite que pour `teskerti.tn`. La genericité est démontrée par la conception, non par l'expérience. Un couplage résiduel au site d'étude persiste, dans l'instruction système du générateur et dans la table d'indices de pages. S'y ajoutent deux limites d'exploitation : l'état des exécutions réside en mémoire dans le processus du serveur, ce qui le rend non persistant, et l'interface ne peut pas déclencher l'auto-réparation.

Les **limites de l'environnement** concernent l'usage de comptes gratuits auprès des fournisseurs de modèles de langage, qui impose un délai entre scénarios et un repli sur les quotas. Elles concernent aussi le site cible, dont la latence de réponse n'a pas été mesurée et qui a provoqué un échec généralisé sur le délai de chargement initial lors d'une exécution ultérieure.

Les **lacunes documentaires** se limitent à `GLOSSARY.md`, qui contient des entrées devenues fausses : la mention d'un modèle Claude / Anthropic, et l'indication d'un passage futur à TypeScript alors que le projet y est intégralement écrit.

Ces limites n'invalident pas les résultats. Elles en précisent la portée : ce qui a été démontré l'a été sur un site, avec des comptes gratuits, et sur une base de code en l'état.

---

## 6.4 Perspectives

Les perspectives qui suivent sont ordonnées par rapport entre coût de mise en œuvre et valeur apportée.

### 6.4.1 Perspectives à court terme

**Exposer l'auto-réparation à l'interface.** C'est la perspective la plus structurante, et la mieux bornée. La logique existe déjà et fonctionne : `autoRepairAndRetry` valide, sauvegarde, applique, relance et consigne. Ce qui manque est le câblage, non la logique. Il suffirait d'ajouter un point d'entrée à l'API qui appelle cette fonction existante, en conservant la validation et le retour arrière. Cette perspective ferait passer l'interface du statut de consultation à celui de pilotage, et supprimerait la bascule manuelle entre les deux modes.

**Extraire le couplage au site d'étude.** Les chemins et sélecteurs propres à `teskerti.tn`, aujourd'hui inscrits dans le code, devraient rejoindre un fichier de configuration indexé par domaine, sur le modèle de ce que `storage.ts` fait déjà pour la base de sélecteurs. Cette extraction est peu coûteuse et rendrait le multi-domaine démontrable au lieu d'être seulement concevable.

**Valider sur un second domaine.** La validation du correctif de portabilité consiste simplement à rejouer la campagne de démonstration sur un autre site. C'est le test qui manque pour transformer une propriété de conception en propriété vérifiée.

### 6.4.2 Perspectives à moyen terme

**Rendre les exécutions persistantes.** Remplacer la `Map` du processus serveur par un stockage sur disque ou en base de données permettrait de survivre à un redémarrage et d'autoriser un déploiement sur plusieurs instances. Le format des artefacts étant déjà structuré, la reprise en charge est acquise : le travail porte sur la couche d'accès.

**Mesurer la latence du site cible.** Une mesure du temps de réponse au chargement initial, collectée sur plusieurs exécutions, permettrait de distinguer un site lent d'une page indisponible, et de valider ou d'écarter l'hypothèse formulée au chapitre 5.

**Instrumenter la part du délai d'attente.** La décomposition de la durée totale d'une exécution — attente entre scénarios, appels aux modèles, exploration, exécution — rendrait le coût mesurable plutôt qu'estimé. Un journal de phase le permettrait sans modifier la logique.

### 6.4.3 Perspectives à plus long terme

**Remplacer l'interrogation périodique par un canal persistant.** L'interrogation toutes les 1 500 ms fonctionne et reste simple, mais la mise à jour est différée et le nombre de requêtes croît avec la durée. WebSocket ou Server-Sent Events supprimeraient cette contrainte.

**Mettre en place une chaîne d'intégration continue.** Le déclenchement manuel limite la fréquence de validation. L'exécution automatique à chaque modification d'un user story, ou de la base de sélecteurs, prolongerait la détection des ruptures.

**Évaluer le multi-domaine sur un cas réel.** L'arbitrage du chapitre 3 conclut à un orchestrateur déterministe, sur la base des trois options examinées. Un banc d'essai comparatif, sur un même ticket et avec une même base de sélecteurs, donnerait une mesure plutôt qu'une appréciation.

---

## 6.5 Bilan

Ce stage a produit un outil fonctionnel, documenté et vérifiable. Sa valeur ne tient pas à la génération de tests en elle-même — d'autres outils le font — mais à la chaîne complète qui va du critère d'acceptation écrit dans Jira jusqu'à la réparation automatique d'un script devenu obsolète, en passant par l'exécution et le diagnostic.

Trois convictions ressortent de ce travail. La première est qu'un pipeline d'exploitation de tests gagne à être déterministe dans tout ce qui n'est pas linguistique : la classification des échecs, la construction du plan de réparation et le contrôle de sécurité ne doivent dépendre d'aucun modèle. La deuxième est qu'une boucle de reprise doit être bornée, et que sa borne doit être lisible dans le code : `attempt <= maxAttempts` est une condition qui dit exactement ce qu'elle fait. La troisième est que la distinction entre ce que l'outil démontre et ce qu'il permet est ce qui rend un rapport honnête.

Les perspectives identifiées ne remettent pas en cause le système livré ; elles en précisent l'étape suivante. La plus importante est connue et bornée : exposer à l'interface une logique de réparation déjà écrite et déjà testée.

---

*Liste des tableaux : aucune.*

*Liste des figures : aucune.*

*Prochaine section : bibliographie et annexes.*
