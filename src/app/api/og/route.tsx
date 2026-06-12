import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const PIP_BG: Record<string, string> = {
  W: "#fde9b8",
  U: "#3b82f6",
  B: "#57534e",
  R: "#ef4444",
  G: "#16a34a",
};

/**
 * Social-unfurl card: /api/og?name=Deck&cmdr=Commander&ci=WUB&art=<scryfall art_crop>
 * Art URLs are restricted to Scryfall's CDN.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const name = p.get("name")?.slice(0, 60) ?? "EDH Deck";
  const cmdr = p.get("cmdr")?.slice(0, 80) ?? "";
  const ci = (p.get("ci") ?? "").split("").filter((c) => c in PIP_BG);
  const artParam = p.get("art");
  const art = artParam && artParam.startsWith("https://cards.scryfall.io/") ? artParam : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#08080a",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.55,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #08080a 15%, rgba(8,8,10,0.4) 60%, transparent)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", padding: 48, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 56, fontWeight: 900, color: "white" }}>{name}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {ci.map((c) => (
                <div
                  key={c}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    background: PIP_BG[c],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: c === "W" ? "#1c1917" : "white",
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
          {cmdr && <span style={{ fontSize: 28, color: "#d6d3d1", marginTop: 8 }}>{cmdr}</span>}
          <span style={{ fontSize: 18, color: "#78716c", marginTop: 16 }}>
            Glitched Goblet Playtester · Commander deck showcase
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
