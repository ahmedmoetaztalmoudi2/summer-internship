# Chapitre 1. Introduction générale

Ce chapitre situe le stage dans son contexte, expose la problématique à laquelle il répond, précise les objectifs et le périmètre du travail, présente la démarche suivie et annonce l'organisation du rapport.

---

## 1.1 Contexte du stage

Le stage s'est déroulé au sein de Capgemini Engineering, dans une équipe en charge de la qualité logicielle, sur la période du 06 juillet 2026 au 06 septembre 2026. Le sujet, formulé par mon encadrante et validé au début de la période, est le suivant : développer une solution basée sur l'intelligence artificielle pour la génération automatique de cas de tests et de scripts d'automatisation à partir des user stories Jira.

Le contexte technique de ce besoin est celui des projets agiles. Les user stories sont décrites dans Jira, leurs critères d'acceptation expriment ce que le système doit garantir, et la validation automatisée repose sur des scripts d'automatisation. Deux difficultés se présentent dans la pratique. La première est le coût de traduction : transformer un critère d'acceptation rédigé en langue naturelle en un cas de test, puis en un script exécutable, est un travail manuel, long et répétitif. La seconde est le coût de maintenance : lorsqu'une interface change, les sélecteurs qui la ciblent cessent de fonctionner, et chaque script doit être rouvert, corrigé et relancé individuellement.

La solution à développer doit donc faire plus que générer des tests : elle doit prendre en charge la maintenance des scripts qu'elle produit.

---

## 1.2 Problématique

La problématique de ce stage se formule ainsi : **comment produire, à partir d'une user story Jira, des cas de tests et des scripts d'automatisation fiables, puis assurer leur maintenance lorsque le site cible évolue, sans intervention manuelle de l'analyste qualité ?**

Cette formulation recouvre quatre questions techniques. Comment extraire du ticket la matière utile au test — le résumé, la description, les critères d'acceptation ? Comment transformer ces éléments en scénarios Gherkin structurés ? Comment choisir, dans une interface réelle, les sélecteurs que le script utilisera ? Et comment détecter un échec, en comprendre la cause et corriger le script de manière automatisée ?

Une cinquième question traverse les précédentes : celle de l'usage des modèles de langage. La génération de scénarios et de code relève de la langue, mais la classification des échecs, la construction des plans de réparation et le contrôle de sécurité ne devraient dépendre d'aucun modèle. Le rapport s'appuie à plusieurs reprises sur cette distinction entre les étapes linguistiques et les étapes déterministes.

---

## 1.3 Objectifs et périmètre du travail

L'objectif principal est de livrer un outil fonctionnel qui enchaîne, de bout en bout, l'extraction des tickets, la génération des scénarios Gherkin, la génération des scripts Playwright, leur exécution, puis l'analyse et la réparation des échecs. Cinq objectifs opérationnels en découlent :

- extraire un ticket Jira et convertir sa description du format Atlassian Document Format vers le langage naturel ;
- générer des scénarios Gherkin à partir des critères d'acceptation, avec un contrôle de qualité des scénarios produits ;
- construire une base de sélecteurs par exploration automatique du site cible, et générer des scripts Playwright qui s'y appuient ;
- exécuter les tests, classer les échecs selon un moteur déterministe de règles et produire des plans de réparation ;
- appliquer, en mode ligne de commande, les réparations proposées et relancer les scénarios, dans la limite de trois tentatives.

Le périmètre est délimité par trois choix assumés. La base de sélecteurs n'a été construite que pour un seul site d'étude, `teskerti.tn`, une plateforme de billetterie en ligne ; la généricité de l'outil est donc démontrée par la conception, non par l'expérience. Les modèles de langage utilisés sont accessibles par des comptes gratuits, ce qui conditionne l'usage par des délais d'attente et des reprises sur quota. Enfin, l'application des corrections est réservée au mode ligne de commande : l'interface web affiche les analyses et les propositions, mais ne modifie pas les scripts.

---

## 1.4 Démarche et méthodologie

La démarche a suivi les étapes classiques d'un projet d'ingénierie logicielle, allégées pour la durée du stage. Une première phase d'analyse a porté sur l'existant : lecture des documents de stage, prise en main de Jira, de Gherkin et de Playwright, et identification du besoin étendu autour de la maintenance des scripts. La conception a ensuite précisé l'architecture du pipeline, le modèle de données partagé entre les étapes et les deux modes d'exécution. L'implémentation a été conduite par modules, chacun vérifié au fur et à mesure avant d'être relié au suivant. La validation finale a combiné des vérifications statiques du code et des artefacts, et trois campagnes d'exécution dont les résultats sont analysés au chapitre 5.

Deux principes de méthode ont guidé le travail. Le premier est la traçabilité : chaque affirmation technique du rapport renvoie au fichier et à la ligne qui l'implémente, et chaque résultat chiffré renvoie à l'artefact qui le prouve. Le second est l'honnêteté de la preuve : ce qui n'a pas pu être établi — une exécution réussie avec le fournisseur de secours, la part exacte d'un délai dans une durée totale — est signalé comme tel plutôt que remplacé par une valeur plausible.

---

## 1.5 Structure du rapport

Le rapport est organisé en six chapitres. Le chapitre 2 formalise le besoin : acteurs, exigences fonctionnelles et non fonctionnelles, périmètre couvert. Le chapitre 3 présente l'architecture du système, les choix technologiques et les structures de données qui relient les étapes. Le chapitre 4 décrit l'implémentation de chaque module. Le chapitre 5 expose la démarche de validation, les vérifications statiques et les résultats des trois campagnes, puis les limites constatées. Le chapitre 6 conclut, évalue ce que les campagnes démontrent réellement et énonce les perspectives d'évolution. La bibliographie et les annexes regroupent les références citées et des extraits des artefacts produits.

---

*Liste des tableaux : aucune.*

*Liste des figures : aucune.*

*Prochaine section : chapitre 2 - Analyse des besoins et spécifications.*