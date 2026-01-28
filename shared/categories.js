// shared/categories.js
export const CATEGORY_TAXONOMY_VERSION = 1;

export const CATEGORY_TAXONOMY = [
    // ---------------------------
    // SPECIAL / OTHER
    // ---------------------------
    { key: "special", label: "Špeciálne", parent: null },
    { key: "special.discount", label: "Špeciálne/Zľavy", parent: "special" },
    { key: "special.deposit", label: "Špeciálne/Zálohy a obaly", parent: "special" },
    { key: "other", label: "Iné", parent: null },

    // ---------------------------
    // PRODUCE (OVOCIE/ZELENINA)
    // ---------------------------
    { key: "produce", label: "Ovocie a zelenina", parent: null },
    { key: "produce.fruit", label: "Ovocie a zelenina/Ovocie", parent: "produce" },
    { key: "produce.vegetable", label: "Ovocie a zelenina/Zelenina", parent: "produce" },
    { key: "produce.salads", label: "Ovocie a zelenina/Šaláty a listová", parent: "produce" },
    { key: "produce.herbs", label: "Ovocie a zelenina/Bylinky", parent: "produce" },
    { key: "produce.mushrooms", label: "Ovocie a zelenina/Huby", parent: "produce" },
    { key: "produce.nuts_seeds", label: "Ovocie a zelenina/Orechy a semienka", parent: "produce" },

    // ---------------------------
    // BAKERY (PEČIVO)
    // ---------------------------
    { key: "bakery", label: "Pečivo", parent: null },
    { key: "bakery.bread", label: "Pečivo/Chlieb", parent: "bakery" },
    { key: "bakery.bread.classic", label: "Pečivo/Chlieb/Klasický", parent: "bakery.bread" },
    { key: "bakery.bread.toast", label: "Pečivo/Chlieb/Toastový", parent: "bakery.bread" },
    { key: "bakery.rolls", label: "Pečivo/Rožky a žemle", parent: "bakery" },
    { key: "bakery.baguette", label: "Pečivo/Bagety", parent: "bakery" },
    { key: "bakery.wraps", label: "Pečivo/Tortilly a wrapy", parent: "bakery" },
    { key: "bakery.pastry", label: "Pečivo/Pečivo sladké a slané", parent: "bakery" },
    { key: "bakery.pastry.sweet", label: "Pečivo/Sladké pečivo", parent: "bakery.pastry" },
    { key: "bakery.pastry.salty", label: "Pečivo/Slané pečivo", parent: "bakery.pastry" },
    { key: "bakery.cakes", label: "Pečivo/Koláče a zákusky", parent: "bakery" },

    // ---------------------------
    // DAIRY (MLIEČNE)
    // ---------------------------
    { key: "dairy", label: "Mliečne výrobky", parent: null },
    { key: "dairy.milk", label: "Mliečne výrobky/Mlieko", parent: "dairy" },
    { key: "dairy.yogurt", label: "Mliečne výrobky/Jogurty", parent: "dairy" },
    { key: "dairy.yogurt.protein", label: "Mliečne výrobky/Jogurty/Proteínové", parent: "dairy.yogurt" },
    { key: "dairy.kefir", label: "Mliečne výrobky/Kefír a acidko", parent: "dairy" },
    { key: "dairy.cheese", label: "Mliečne výrobky/Syry", parent: "dairy" },
    { key: "dairy.cottage", label: "Mliečne výrobky/Tvaroh a cottage", parent: "dairy" },
    { key: "dairy.butter", label: "Mliečne výrobky/Maslo", parent: "dairy" },
    { key: "dairy.cream", label: "Mliečne výrobky/Smotana", parent: "dairy" },
    { key: "dairy.dessert", label: "Mliečne výrobky/Dezerty (puding, krémy)", parent: "dairy" },
    { key: "dairy.plant", label: "Mliečne výrobky/Rastlinné alternatívy", parent: "dairy" },

    // ---------------------------
    // EGGS
    // ---------------------------
    { key: "eggs", label: "Vajcia", parent: null },

    // ---------------------------
    // MEAT (MÄSO + UDENINY)
    // ---------------------------
    { key: "meat", label: "Mäso", parent: null },
    { key: "meat.fresh", label: "Mäso/Čerstvé", parent: "meat" },
    { key: "meat.fresh.poultry", label: "Mäso/Čerstvé/Hydina", parent: "meat.fresh" },
    { key: "meat.fresh.pork", label: "Mäso/Čerstvé/Bravčové", parent: "meat.fresh" },
    { key: "meat.fresh.beef", label: "Mäso/Čerstvé/Hovädzie", parent: "meat.fresh" },
    { key: "meat.fresh.other", label: "Mäso/Čerstvé/Iné", parent: "meat.fresh" },

    { key: "meat.processed", label: "Mäso/Udeniny", parent: "meat" },
    { key: "meat.processed.ham", label: "Mäso/Udeniny/Šunka", parent: "meat.processed" },
    { key: "meat.processed.salami", label: "Mäso/Udeniny/Saláma", parent: "meat.processed" },
    { key: "meat.processed.sausage", label: "Mäso/Udeniny/Klobása", parent: "meat.processed" },
    { key: "meat.processed.frankfurters", label: "Mäso/Udeniny/Párky", parent: "meat.processed" },
    { key: "meat.processed.bacon", label: "Mäso/Udeniny/Slanina", parent: "meat.processed" },
    { key: "meat.processed.pate", label: "Mäso/Udeniny/Paštéty", parent: "meat.processed" },
    { key: "meat.processed.headcheese", label: "Mäso/Udeniny/Tlačenka", parent: "meat.processed" },
    { key: "meat.processed.spreads", label: "Mäso/Udeniny/Nátierky", parent: "meat.processed" },
    { key: "meat.processed.other", label: "Mäso/Udeniny/Iné", parent: "meat.processed" },

    // ---------------------------
    // FISH
    // ---------------------------
    { key: "fish", label: "Ryby a morské plody", parent: null },
    { key: "fish.fresh", label: "Ryby a morské plody/Čerstvé", parent: "fish" },
    { key: "fish.canned", label: "Ryby a morské plody/Konzervy", parent: "fish" },

    // ---------------------------
    // READY / DELI (HOTOVÉ)
    // ---------------------------
    { key: "ready", label: "Hotové jedlá", parent: null },
    { key: "ready.savory", label: "Hotové jedlá/Slané jedlo", parent: "ready" },
    { key: "ready.soups", label: "Hotové jedlá/Polievky", parent: "ready" },
    { key: "ready.salads", label: "Hotové jedlá/Šaláty", parent: "ready" },
    { key: "ready.sandwich", label: "Hotové jedlá/Sendreče a bagety", parent: "ready" },

    // ---------------------------
    // FROZEN (MRAZENÉ) – detailnejšie
    // ---------------------------
    { key: "frozen", label: "Mrazené", parent: null },
    { key: "frozen.veg", label: "Mrazené/Zelenina", parent: "frozen" },
    { key: "frozen.fruit", label: "Mrazené/Ovocie", parent: "frozen" },
    { key: "frozen.meat", label: "Mrazené/Mäso", parent: "frozen" },
    { key: "frozen.fish", label: "Mrazené/Ryby", parent: "frozen" },
    { key: "frozen.pizza", label: "Mrazené/Pizza", parent: "frozen" },
    { key: "frozen.fries", label: "Mrazené/Hranolky a zemiakové", parent: "frozen" },
    { key: "frozen.meals", label: "Mrazené/Hotové jedlá", parent: "frozen" },
    { key: "frozen.icecream", label: "Mrazené/Zmrzlina", parent: "frozen" },

    // ---------------------------
    // BREAKFAST (RAŇAJKY) – detailnejšie
    // ---------------------------
    { key: "breakfast", label: "Raňajky", parent: null },
    { key: "breakfast.cereals", label: "Raňajky/Cereálie", parent: "breakfast" },
    { key: "breakfast.muesli", label: "Raňajky/Müsli a granola", parent: "breakfast" },
    { key: "breakfast.oats", label: "Raňajky/Vločky", parent: "breakfast" },
    { key: "breakfast.spreads", label: "Raňajky/Nátierky", parent: "breakfast" },
    { key: "breakfast.spreads.sweet", label: "Raňajky/Nátierky/Sladké", parent: "breakfast.spreads" },
    { key: "breakfast.spreads.savory", label: "Raňajky/Nátierky/Slané", parent: "breakfast.spreads" },

    // ---------------------------
    // PANTRY (TRVANLIVÉ) – ultimátne
    // ---------------------------
    { key: "pantry", label: "Trvanlivé potraviny", parent: null },

    // Základy / prílohy
    { key: "pantry.pasta", label: "Trvanlivé potraviny/Cestoviny", parent: "pantry" },
    { key: "pantry.rice", label: "Trvanlivé potraviny/Ryža", parent: "pantry" },
    { key: "pantry.grains", label: "Trvanlivé potraviny/Obilniny (bulgur, kuskus)", parent: "pantry" },
    { key: "pantry.legumes", label: "Trvanlivé potraviny/Lušteniny", parent: "pantry" },

    // Konzervy – ako sa budú ukladať
    { key: "pantry.canned", label: "Trvanlivé potraviny/Konzervy", parent: "pantry" },
    { key: "pantry.canned.veg", label: "Trvanlivé potraviny/Konzervy/Zelenina (kukurica…)", parent: "pantry.canned" },
    { key: "pantry.canned.beans", label: "Trvanlivé potraviny/Konzervy/Fazuľa a strukoviny", parent: "pantry.canned" },
    { key: "pantry.canned.meat", label: "Trvanlivé potraviny/Konzervy/Mäso", parent: "pantry.canned" },
    { key: "pantry.canned.fish", label: "Trvanlivé potraviny/Konzervy/Ryby", parent: "pantry.canned" },
    { key: "pantry.canned.fruit", label: "Trvanlivé potraviny/Konzervy/Ovocie", parent: "pantry.canned" },
    { key: "pantry.canned.soups_meals", label: "Trvanlivé potraviny/Konzervy/Polievky a hotové", parent: "pantry.canned" },

    // Omáčky / dochucovanie
    { key: "pantry.sauces", label: "Trvanlivé potraviny/Omáčky a dressingy", parent: "pantry" },
    { key: "pantry.condiments", label: "Trvanlivé potraviny/Dochucovadlá (kečup, horčica)", parent: "pantry" },
    { key: "pantry.spices", label: "Trvanlivé potraviny/Koreniny", parent: "pantry" },
    { key: "pantry.spices.salt", label: "Trvanlivé potraviny/Koreniny/Soľ", parent: "pantry.spices" },
    { key: "pantry.spices.pepper", label: "Trvanlivé potraviny/Koreniny/Korenie", parent: "pantry.spices" },
    { key: "pantry.stock_cubes", label: "Trvanlivé potraviny/Bujóny a vývary", parent: "pantry" },

    // Sladidlá / cukor
    { key: "pantry.sweeteners", label: "Trvanlivé potraviny/Cukor a sladidlá", parent: "pantry" },

    // Džemy / marmelády
    { key: "pantry.jam", label: "Trvanlivé potraviny/Džemy a marmelády", parent: "pantry" },
    { key: "pantry.honey", label: "Trvanlivé potraviny/Med", parent: "pantry" },

    // Oleje / ocot
    { key: "pantry.oil", label: "Trvanlivé potraviny/Oleje", parent: "pantry" },
    { key: "pantry.vinegar", label: "Trvanlivé potraviny/Ocet", parent: "pantry" },

    // Nakladané / olivy
    { key: "pantry.pickles", label: "Trvanlivé potraviny/Nakladané", parent: "pantry" },
    { key: "pantry.olives", label: "Trvanlivé potraviny/Olivy", parent: "pantry" },

    // Polievky instantné / hotové
    { key: "pantry.instant_soups", label: "Trvanlivé potraviny/Instantné polievky", parent: "pantry" },

    // ---------------------------
    // BAKING (PEČENIE) – detailnejšie
    // ---------------------------
    { key: "baking", label: "Pečenie", parent: null },
    { key: "baking.flour", label: "Pečenie/Múka", parent: "baking" },
    { key: "baking.powders", label: "Pečenie/Prášok do pečiva a kypriace", parent: "baking" },
    { key: "baking.yeast", label: "Pečenie/Droždie", parent: "baking" },
    { key: "baking.vanilla_sugar", label: "Pečenie/Vanilkový cukor a arómy", parent: "baking" },
    { key: "baking.cocoa", label: "Pečenie/Kakao", parent: "baking" },
    { key: "baking.chocolate", label: "Pečenie/Čokoláda na varenie", parent: "baking" },
    { key: "baking.decor", label: "Pečenie/Ozdoby a posypy", parent: "baking" },

    // ---------------------------
    // BEVERAGES (NÁPOJE) – detailnejšie
    // ---------------------------
    { key: "beverage", label: "Nápoje", parent: null },
    { key: "beverage.water", label: "Nápoje/Voda", parent: "beverage" },
    { key: "beverage.water.still", label: "Nápoje/Voda/Nesýtená", parent: "beverage.water" },
    { key: "beverage.water.sparkling", label: "Nápoje/Voda/Sýtená", parent: "beverage.water" },
    { key: "beverage.soft", label: "Nápoje/Nealko", parent: "beverage" },
    { key: "beverage.soft.zero", label: "Nápoje/Nealko/Zero", parent: "beverage.soft" },
    { key: "beverage.juice", label: "Nápoje/Džúsy", parent: "beverage" },
    { key: "beverage.syrup", label: "Nápoje/Sirupy", parent: "beverage" },
    { key: "beverage.energy", label: "Nápoje/Energetické", parent: "beverage" },
    { key: "beverage.isotonic", label: "Nápoje/Izotonické", parent: "beverage" },
    { key: "beverage.tea", label: "Nápoje/Čaj", parent: "beverage" },
    { key: "beverage.coffee", label: "Nápoje/Káva", parent: "beverage" },
    { key: "beverage.protein", label: "Nápoje/Proteínové nápoje", parent: "beverage" },

    // ---------------------------
    // SNACKS (SLANÉ)
    // ---------------------------
    { key: "snacks", label: "Snacky", parent: null },
    { key: "snacks.salty", label: "Snacky/Slané (čipsy, chrumky)", parent: "snacks" },
    { key: "snacks.nuts", label: "Snacky/Orechy a semienka", parent: "snacks" },
    { key: "snacks.crackers", label: "Snacky/Krekry a slané pečivo", parent: "snacks" },

    // ---------------------------
    // SWEETS (SLADKOSTI)
    // ---------------------------
    { key: "sweets", label: "Sladkosti", parent: null },
    { key: "sweets.chocolate", label: "Sladkosti/Čokoláda", parent: "sweets" },
    { key: "sweets.candy", label: "Sladkosti/Cukríky", parent: "sweets" },
    { key: "sweets.cookies", label: "Sladkosti/Keksíky", parent: "sweets" },
    { key: "sweets.bars", label: "Sladkosti/Tyčinky", parent: "sweets" },
    { key: "sweets.bars.protein", label: "Sladkosti/Tyčinky/Proteínové", parent: "sweets.bars" },
    { key: "sweets.dessert", label: "Sladkosti/Dezerty", parent: "sweets" },

    // ---------------------------
    // HEALTH / FITNESS
    // ---------------------------
    { key: "health", label: "Zdravie a fitness", parent: null },
    { key: "health.supplements", label: "Zdravie a fitness/Doplnky výživy", parent: "health" },
    { key: "health.protein", label: "Zdravie a fitness/Proteín (prášok)", parent: "health" },

    // ---------------------------
    // HOUSEHOLD (DOMÁCNOSŤ) – detailnejšie
    // ---------------------------
    { key: "household", label: "Domácnosť", parent: null },
    { key: "household.cleaning", label: "Domácnosť/Čistiace prostriedky", parent: "household" },
    { key: "household.laundry", label: "Domácnosť/Pranie (prášky, gély)", parent: "household" },
    { key: "household.dishwasher", label: "Domácnosť/Umývačka", parent: "household" },
    { key: "household.dishes", label: "Domácnosť/Riad (jar, hubky)", parent: "household" },
    { key: "household.paper", label: "Domácnosť/Papier (toal., utierky)", parent: "household" },
    { key: "household.trash", label: "Domácnosť/Vrecia do koša", parent: "household" },
    { key: "household.storage", label: "Domácnosť/Skladovanie (alobal, fólie)", parent: "household" },

    // ---------------------------
    // HYGIENE (HYGIENA) – detailnejšie
    // ---------------------------
    { key: "hygiene", label: "Hygiena", parent: null },
    { key: "hygiene.personal", label: "Hygiena/Osobná hygiena", parent: "hygiene" },
    { key: "hygiene.dental", label: "Hygiena/Zubná hygiena", parent: "hygiene" },
    { key: "hygiene.hair", label: "Hygiena/Vlasy (šampón, kond.)", parent: "hygiene" },
    { key: "hygiene.body", label: "Hygiena/Telo (sprcháče, mydlá)", parent: "hygiene" },
    { key: "hygiene.cosmetics", label: "Hygiena/Kozmetika", parent: "hygiene" },
    { key: "hygiene.shaving", label: "Hygiena/Holenie", parent: "hygiene" },

    // ---------------------------
    //  PET
    // ---------------------------

    { key: "pet", label: "Zvieratá", parent: null },
    { key: "pet.food", label: "Zvieratá/Krmivo", parent: "pet" },
    { key: "pet.other", label: "Zvieratá/Iné", parent: "pet" },

    // ---------------------------
    // PHARMACY / OTC
    // ---------------------------
    { key: "pharmacy", label: "Lekáreň a OTC", parent: null },
    { key: "pharmacy.otc", label: "Lekáreň a OTC/Lieky bez predpisu", parent: "pharmacy" },
    { key: "pharmacy.vitamins", label: "Lekáreň a OTC/Vitamíny", parent: "pharmacy" },
    { key: "pharmacy.first_aid", label: "Lekáreň a OTC/Prvá pomoc", parent: "pharmacy" },

    // ---------------------------
    // ALCOHOL
    // ---------------------------
    { key: "alcohol", label: "Alkohol", parent: null },
    { key: "alcohol.beer", label: "Alkohol/Pivo", parent: "alcohol" },
    { key: "alcohol.wine", label: "Alkohol/Víno", parent: "alcohol" },
    { key: "alcohol.spirits", label: "Alkohol/Tvrdý", parent: "alcohol" },

    // ---------------------------
    // STATIONERY / KITCHEN / CLOTHING
    // ---------------------------
    { key: "stationery", label: "Papiernictvo", parent: null },
    { key: "stationery.school", label: "Papiernictvo/Škola", parent: "stationery" },
    { key: "stationery.office", label: "Papiernictvo/Kancelária", parent: "stationery" },

    { key: "kitchen", label: "Kuchyňa", parent: null },
    { key: "kitchen.utensils", label: "Kuchyňa/Náradie a pomôcky", parent: "kitchen" },
    { key: "kitchen.cookware", label: "Kuchyňa/Riad a panvice", parent: "kitchen" },

    { key: "clothing", label: "Oblečenie", parent: null },
];

