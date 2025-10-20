const els = {
  ean: document.getElementById('ean'),
  btn: document.getElementById('btn'),
  pname: document.getElementById('pname'),
  brand: document.getElementById('brand'),
  mat: document.getElementById('mat'),
  bin: document.getElementById('bin'),
  conf: document.getElementById('conf'),
  explain: document.getElementById('explain'),
  raw: document.getElementById('raw'),
};
// 🎛️ Gestion du loader
function showLoader() {
  document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
  document.getElementById('loader').classList.add('hidden');
}


// Règles locales minimalistes (à remplacer par un fichier epci-regles.json)
const REGLES_LOCALES = {
  epci: "epci_default",
  mapping: {
    // tags OFF normalisés (sans "en:")
    pet: "poubelle_jaune",
    pp: "poubelle_jaune",
    pe: "poubelle_jaune",
    hdpe: "poubelle_jaune",
    ldpe: "poubelle_jaune",
    plastic: "poubelle_jaune",
    cardboard: "poubelle_jaune",
    paper: "poubelle_jaune",
    aluminium: "poubelle_jaune",
    aluminum: "poubelle_jaune",
    metal: "poubelle_jaune",
    steel: "poubelle_jaune",
    glass: "verre",
    // défauts potentiels
    compostable: "poubelle_jaune",
    bioplastic: "poubelle_jaune"
  }
};

const BIN_LABELS = {
  poubelle_jaune: { txt: "Poubelle jaune (emballages)", cls: "yellow" },
  verre: { txt: "Bac verre / borne verre", cls: "green" },
  dechetterie: { txt: "Déchèterie / point d’apport", cls: "gray" },
  ordures_menageres: { txt: "Ordures ménagères", cls: "red" }
};

els.btn.addEventListener('click', onSearch);
els.ean.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSearch(); });

async function onSearch() {
  const ean = (els.ean.value || '').trim();
  if (!/^\d{8,14}$/.test(ean)) {
    alert('Entre un code-barres (8 à 14 chiffres).');
    return;
  }
  resetUI();
  showLoader(); // ✅ afficher le loader ici
  setExplain('Recherche Open Food Facts…');

  try {
    const prod = await fetchOFF(ean);
    els.raw.textContent = JSON.stringify(prod, null, 2);

    // Nettoyage et formatage des noms
let productName = prod.product?.product_name?.trim() || '(Sans nom)';
let brands = prod.product?.brands?.trim() || '—';

// Mise en forme propre : majuscules, espaces, suppression virgules mal placées
productName = productName.charAt(0).toUpperCase() + productName.slice(1);
brands = brands
  .split(',')
  .map(b => b.trim())
  .filter(Boolean)
  .join(', ');

// Cas particuliers : marques connues → affichage simple
if (brands.toLowerCase().includes('ferrero') && productName.toLowerCase().includes('nutella')) {
  productName = 'Pâte à tartiner Nutella';
  brands = 'Ferrero';
}

els.pname.textContent = productName;
els.brand.textContent = brands;


    // 1) On récupère les tags matières OFF
    const mats =
      prod.product?.packaging_materials_tags?.map(n => n.replace(/^.*?:/, '')) // en:pet → pet
      || [];

    // 2) Déduction d’un matériau principal (simple heuristique)
    const primary = pickPrimaryMaterial(mats);
    const materialNameFr = {
  pet: "plastique (PET)",
  pp: "plastique (PP)",
  pe: "plastique (PE)",
  hdpe: "plastique (HDPE)",
  ldpe: "plastique (LDPE)",
  plastic: "plastique",
  cardboard: "carton",
  paper: "papier",
  aluminium: "aluminium",
  aluminum: "aluminium",
  metal: "métal",
  steel: "acier",
  glass: "verre",
  compostable: "biodégradable",
  bioplastic: "bioplastique"
}[primary] || primary || "inconnu";

els.mat.textContent = materialNameFr.charAt(0).toUpperCase() + materialNameFr.slice(1);

    // 3) Mapping vers un bac local
    const bin = mapToBin(primary);
    setBin(bin);

    // 4) Appel IA pour rédiger une explication courte (JSON)
    setExplain('Génération de l’explication IA…');
    const ai = await explainWithAI({
      epci: REGLES_LOCALES.epci,
      product_name: productName,
      brand: brands,
      material_primary: primary,
      mats_list: mats,
      bin
    });
    // 5) Affichage final
    els.conf.textContent = (ai?.confiance != null) ? (ai.confiance.toFixed(2)) : '—';
    els.explain.textContent = ai?.explanation || '(explication indisponible)';
  } catch (err) {
    setExplain('Erreur : ' + (err?.message || String(err)));
  }
  hideLoader(); // ✅ cacher le loader quand c’est fini
}

function pickPrimaryMaterial(tags) {
  if (!tags.length) return null;
  const priority = ['pet', 'pp', 'pe', 'hdpe', 'ldpe', 'aluminium', 'aluminum', 'metal', 'steel', 'cardboard', 'paper', 'glass'];
  for (const p of priority) {
    if (tags.includes(p)) return p;
  }
  return tags[0];
}

function mapToBin(material) {
  if (!material) return 'ordures_menageres';
  return REGLES_LOCALES.mapping[material] || 'ordures_menageres';
}

function setBin(binKey) {
  const lab = BIN_LABELS[binKey] || { txt: binKey, cls: '' };
  els.bin.textContent = lab.txt;
  els.bin.className = `pill ${lab.cls}`;
}

function setExplain(text) { els.explain.textContent = text; }

function resetUI() {
  els.pname.textContent = '—';
  els.brand.textContent = '—';
  els.mat.textContent = '—';
  els.bin.textContent = '—';
  els.bin.className = 'pill';
  els.conf.textContent = '—';
  els.explain.textContent = '—';
  els.raw.textContent = '—';
}

async function fetchOFF(ean) {
  const r = await fetch(`https://world.openfoodfacts.net/api/v2/product/${ean}.json`);
  if (!r.ok) throw new Error('OFF indisponible');
  const data = await r.json();
  if (data.status !== 1) throw new Error('Produit introuvable dans OFF');
  return data;
}

// 👉 Appel de l’endpoint serverless (Netlify/Vercel) qui parle à un LLM
// 🧠 Version améliorée sans IA : explication naturelle et claire
async function explainWithAI(payload) {
  const r = await fetch('/.netlify/functions/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('IA indisponible');
  return await r.json();
}




