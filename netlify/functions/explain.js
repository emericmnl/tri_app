import OpenAI from "openai";

export const handler = async (event) => {
  // 🔒 Étape 1 : on bloque le GET
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // 🔍 Étape 2 : on lit le body reçu
    const { ean, material, bac } = JSON.parse(event.body || "{}");
    console.log("🟡 Requête reçue:", { ean, material, bac });

    // 🔑 Étape 3 : on vérifie la clé
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY absente !");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Clé API manquante" })
      };
    }

    // 🧠 Étape 4 : on prépare la requête OpenAI
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `
      Produit ${ean}, matériau principal : ${material}, bac : ${bac}.
      Explique simplement pourquoi ce bac est le bon choix de tri.
    `;

    // 💬 Étape 5 : on interroge le modèle
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "Pas d'explication générée.";
    console.log("✅ Réponse IA:", text);

    // ✅ Étape 6 : on renvoie la réponse au front
    return {
      statusCode: 200,
      body: JSON.stringify({ explanation: text })
    };

  } catch (err) {
    console.error("💥 Erreur serveur:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Erreur serveur" })
    };
  }
};
