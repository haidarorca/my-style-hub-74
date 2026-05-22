/**
 * useSlashCommands - Hook pour les commandes rapides avec "/"
 * -----------------------------------------------------------
 * Système de "messages rapides" similaire a WhatsApp Business.
 *
 * Usage :
 *   const { registerCommands, handleInput, menuOpen, menuItems, insertCommand } = useSlashCommands();
 *
 *   registerCommands([
 *     { id: "description", label: "Description standard", text: "Produit en [matiere], disponible en [couleur], taille [taille]." },
 *     { id: "variante", label: "Variante multiple", text: "Produit disponible en plusieurs variantes : couleurs et tailles." },
 *   ]);
 *
 *   // Dans l'input :
 *   <textarea
 *     value={value}
 *     onChange={(e) => {
 *       setValue(e.target.value);
 *       handleInput(e.target.value, (newText) => setValue(newText));
 *     }}
 *   />
 *
 *   // Afficher le menu :
 *   {menuOpen && <SlashCommandMenu items={menuItems} onSelect={insertCommand} />}
 */

import { useCallback, useRef, useState } from "react";

export interface SlashCommand {
  /** Identifiant unique */
  id: string;
  /** Label affiche dans le menu */
  label: string;
  /** Texte insere quand la commande est selectionnee */
  text: string;
  /** Icône optionnelle (emoji ou icone) */
  icon?: string;
}

export interface UseSlashCommandsReturn {
  /** Enregistrer les commandes disponibles */
  registerCommands: (commands: SlashCommand[]) => void;
  /** Gerer la saisie utilisateur - retourne true si un menu est ouvert */
  handleInput: (value: string, onReplace: (newValue: string) => void) => boolean;
  /** Inserer une commande */
  insertCommand: (command: SlashCommand) => void;
  /** Le menu est-il ouvert ? */
  menuOpen: boolean;
  /** Items a afficher dans le menu */
  menuItems: SlashCommand[];
  /** Fermer le menu */
  closeMenu: () => void;
}

export function useSlashCommands(): UseSlashCommandsReturn {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<SlashCommand[]>([]);
  const [filter, setFilter] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const commandsRef = useRef<SlashCommand[]>([]);
  const onReplaceRef = useRef<((newValue: string) => void) | undefined>(undefined);
  const lastValueRef = useRef("");

  const registerCommands = useCallback((commands: SlashCommand[]) => {
    commandsRef.current = commands;
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setFilter("");
  }, []);

  const insertCommand = useCallback(
    (command: SlashCommand) => {
      const value = lastValueRef.current;
      const beforeSlash = value.substring(0, cursorPos - filter.length - 1); // -1 pour le "/"
      const afterCursor = value.substring(cursorPos);
      const newValue = beforeSlash + command.text + afterCursor;

      lastValueRef.current = newValue;
      onReplaceRef.current?.(newValue);
      closeMenu();
    },
    [closeMenu, cursorPos, filter.length],
  );

  const handleInput = useCallback(
    (value: string, onReplace: (newValue: string) => void): boolean => {
      lastValueRef.current = value;
      onReplaceRef.current = onReplace;

      // Trouver la position du dernier "/" avant le curseur
      const lastSlashIndex = value.lastIndexOf("/");

      if (lastSlashIndex === -1) {
        if (menuOpen) closeMenu();
        return false;
      }

      // Verifier que le "/" est au debut ou precede d'un espace (debut de mot)
      const charBeforeSlash = value[lastSlashIndex - 1];
      if (lastSlashIndex > 0 && charBeforeSlash !== " " && charBeforeSlash !== "\n") {
        if (menuOpen) closeMenu();
        return false;
      }

      // Extraire le filtre apres le "/"
      const afterSlash = value.substring(lastSlashIndex + 1);
      // Verifier qu'il n'y a pas d'espace apres le "/" (commande en cours de frappe)
      const spaceIndex = afterSlash.indexOf(" ");
      const newlineIndex = afterSlash.indexOf("\n");
      const endIndex =
        spaceIndex === -1
          ? newlineIndex === -1
            ? afterSlash.length
            : newlineIndex
          : newlineIndex === -1
            ? spaceIndex
            : Math.min(spaceIndex, newlineIndex);

      const currentFilter = afterSlash.substring(0, endIndex).toLowerCase();
      setCursorPos(value.length);
      setFilter(currentFilter);

      // Filtrer les commandes
      const filtered = commandsRef.current.filter((cmd) => {
        const search = currentFilter;
        return (
          cmd.id.toLowerCase().includes(search) ||
          cmd.label.toLowerCase().includes(search)
        );
      });

      if (filtered.length === 0 && currentFilter.length > 0) {
        if (menuOpen) closeMenu();
        return false;
      }

      setMenuItems(filtered.length > 0 ? filtered : commandsRef.current);
      setMenuOpen(true);
      return true;
    },
    [closeMenu, menuOpen],
  );

  return {
    registerCommands,
    handleInput,
    insertCommand,
    menuOpen,
    menuItems,
    closeMenu,
  };
}

/** Commandes par defaut pour la generation de produits */
export const DEFAULT_PRODUCT_COMMANDS: SlashCommand[] = [
  {
    id: "description",
    label: "Description standard produit",
    icon: "📝",
    text: "Projet[e] en [matiere], de couleur [couleur], disponible en taille [taille]. Idéal pour [usage]. Design [style], confortable et durable.",
  },
  {
    id: "variante",
    label: "Variantes multiples",
    icon: "🎨",
    text: "Disponible en plusieurs coloris et tailles. Veuillez préciser vos préférences lors de la commande.",
  },
  {
    id: "qualite",
    label: "Qualite premium",
    icon: "✨",
    text: "Fabriqué avec des matériaux de haute qualité. Finition soignée, résistant à l'usure. Produit premium garanti.",
  },
  {
    id: "livraison",
    label: "Info livraison",
    icon: "🚚",
    text: "Livraison disponible partout au Sénégal. Délai de livraison : 24-72h selon la localisation. Emballage soigné garanti.",
  },
  {
    id: "cadeau",
    label: "Idée cadeau",
    icon: "🎁",
    text: "Parfait comme cadeau pour un proche. Emballage cadeau disponible sur demande. Livraison directe chez le destinataire possible.",
  },
  {
    id: "entretien",
    label: "Conseils entretien",
    icon: "🧼",
    text: "Entretien facile. Lavage à [température] recommandé. Ne pas utiliser de javel. Séchage à l'air libre préférable.",
  },
  {
    id: "garantie",
    label: "Garantie satisfaction",
    icon: "🛡️",
    text: "Satisfait ou remboursé sous 7 jours. Garantie qualité 30 jours. Échange possible si le produit ne convient pas.",
  },
  {
    id: "modele1",
    label: "Modèle basique",
    icon: "👕",
    text: "Modèle classique et intemporel. Coupe régulière adaptée à toutes les morphologies. Coloris neutres faciles à associer.",
  },
  {
    id: "modele2",
    label: "Modèle tendance",
    icon: "🔥",
    text: "Design tendance et moderne. Coupe ajustée actuelle. Couleurs populaires de la saison. Style urbain et contemporain.",
  },
  {
    id: "telephone",
    label: "Accessoire téléphone",
    icon: "📱",
    text: "Compatible avec la plupart des modèles de téléphone. Protection optimale contre les chocs et rayures. Accès facile à tous les ports et boutons.",
  },
  {
    id: "chaussure",
    label: "Description chaussure",
    icon: "👟",
    text: "Semme antidérapante et confortable. Tige en [matiere] respirante. Coussin d'accueil rembourré. Pointure standard, prenez votre taille habituelle.",
  },
  {
    id: "sac",
    label: "Description sac/accessoire",
    icon: "👜",
    text: "Multiple compartiments pour un rangement organisé. Fermeture éclair sécurisée. Bandoulière ajustable et confortable. Capacité : [X] litres.",
  },
];

/** Commandes pour la generation de variantes */
export const DEFAULT_VARIANT_COMMANDS: SlashCommand[] = [
  {
    id: "tailles-sml",
    label: "Tailles S, M, L, XL",
    icon: "📏",
    text: "S, M, L, XL",
  },
  {
    id: "tailles-numeric",
    label: "Tailles numériques 36-44",
    icon: "📐",
    text: "36, 37, 38, 39, 40, 41, 42, 43, 44",
  },
  {
    id: "couleurs-basiques",
    label: "Couleurs basiques",
    icon: "🎨",
    text: "Noir, Blanc, Gris, Bleu marine, Beige",
  },
  {
    id: "couleurs-pop",
    label: "Couleurs pop",
    icon: "🌈",
    text: "Rouge, Bleu, Vert, Jaune, Rose, Violet, Orange",
  },
  {
    id: "matiere-coton",
    label: "100% Coton",
    icon: "🧵",
    text: "100% Coton",
  },
  {
    id: "matiere-melange",
    label: "Mélange polyester/coton",
    icon: "🧶",
    text: "65% Polyester, 35% Coton",
  },
];
