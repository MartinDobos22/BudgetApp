export const CATEGORY_TREE: Record<string, string[]> = {
  Potraviny: ["Pečivo", "Mliečne", "Mäso", "Ovocie/Zelenina", "Nápoje", "Trvanlivé", "Sladkosti"],
  Drogéria: ["Kozmetika", "Hygiena", "Deti", "Čistiace"],
  Domácnosť: ["Náradie", "Dekorácie", "Záhrada", "Elektronika"],
  Reštaurácie: ["Raňajky", "Obed", "Večera", "Káva/Dezerty"],
  Doprava: ["MHD", "Palivo", "Parkovanie", "Servis"],
  Zdravie: ["Lekáreň", "Vitamíny", "Lekár"],
  Oblečenie: ["Dámske", "Pánske", "Deti", "Doplnky"],
  Iné: ["Darčeky", "Predplatné", "Voľný čas"],
};

export const MERCHANT_GROUPS = Object.keys(CATEGORY_TREE);
