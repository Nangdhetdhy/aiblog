const TOPICS = [
  "Tren teknologi AI terbaru di Indonesia",
  "Tips produktivitas kerja dari rumah",
  "Panduan investasi saham untuk pemula",
  "Gaya hidup sehat dengan budget minim",
  "Cara memulai bisnis online dari nol",
  "Perkembangan startup teknologi Indonesia",
  "Tips belajar programming secara otodidak",
];

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    const ANTHROPIC_KEY = Netlify.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY belum diset di environment variables.");

    const SUPABASE_URL  = Netlify.env.get("SUPABASE_URL");
    const SUPABASE_KEY  = Netlify.env.get("SUPABASE_ANON_KEY");

    let topic  = TOPICS[new Date().getDay() % TOPICS.length];
    let tone   = "informatif dan mudah dipahami";
    let length = "sedang sekitar 700 kata";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.topic)  topic  = body.topic;
        if (body.tone)   tone   = body.tone;
        if (body.length) length = body.length;
      } catch (_) {}
    }

    // 1. Generate artikel dengan Claude AI
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Kamu adalah penulis blog profesional. Tulis artikel blog ${length} dalam Bahasa Indonesia tentang: "${topic}"\n\nKetentuan:\n- Gaya penulisan: ${tone}\n- Mulai dengan hook menarik\n- Gunakan sub-judul (## untuk H2)\n- Isi informatif dan bermanfaat\n- Akhiri dengan kesimpulan\n\nSetelah artikel, tambahkan blok PERSIS:\n---SEO---\nMETA_TITLE: [judul SEO maks 60 karakter]\nMETA_DESC: [deskripsi 130-160 karakter]\nKEYWORDS: [keyword1, keyword2, keyword3, keyword4, keyword5]\n---END SEO---`
        }]
      })
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiData.error?.message || "Claude API error");

    const fullText = aiData.content[0].text;
    let content = fullText;
    const seo = { title: "", desc: "", kw: [] };

    const seoMatch = fullText.match(/---SEO---([\s\S]*?)---END SEO---/);
    if (seoMatch) {
      content = fullText.replace(/---SEO---[\s\S]*?---END SEO---/, "").trim();
      const t = seoMatch[1].match(/META_TITLE:\s*(.+)/);
      const d = seoMatch[1].match(/META_DESC:\s*(.+)/);
      const k = seoMatch[1].match(/KEYWORDS:\s*(.+)/);
      if (t) seo.title = t[1].trim();
      if (d) seo.desc  = d[1].trim();
      if (k) seo.kw    = k[1].split(",").map(x => x.trim());
    }

    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : `Artikel: ${topic}`;
    const body  = content.replace(/^#\s+.+\n?/m, "").trim();

    // 2. Simpan ke Supabase
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        title, content: body, topic,
        meta_title: seo.title || title,
        meta_desc:  seo.desc,
        keywords:   seo.kw,
        status:     "published",
        published_at: new Date().toISOString(),
      })
    });

    const saved = await sbRes.json();
    if (!sbRes.ok) throw new Error(saved.message || "Gagal simpan ke Supabase");

    return new Response(JSON.stringify({ success: true, id: saved[0].id, title: saved[0].title }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/generate"
};
