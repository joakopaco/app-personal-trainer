import { useEffect, useState } from "react";
import { cloud } from "../../adapters/supabase";
import { useData } from "../../app/DataProvider";
import { saveLibrary } from "../../adapters/library";
export function PrivateMedia({ exerciseId }: { exerciseId: string }) {
  const { db } = useData();
  const [revision, setRevision] = useState<number | null>(null),
    [url, setUrl] = useState(""),
    [credit, setCredit] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    let blobUrl = "";
    void (async () => {
      const r = await cloud()
        .from("custom_exercises")
        .select("revision,media_path,media_credit")
        .eq("id", exerciseId)
        .maybeSingle();
      if (!active || !r.data) return;
      setRevision(r.data.revision);
      setCredit(r.data.media_credit ?? "");
      if (r.data.media_path) {
        const file = await cloud()
          .storage.from("exercise-media")
          .download(r.data.media_path);
        if (file.data && active) {
          blobUrl = URL.createObjectURL(file.data);
          setUrl(blobUrl);
        }
      }
    })();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [exerciseId, reload]);
  if (revision === null) return null;
  return (
    <div className="stack">
      {url && (
        <img
          src={url}
          alt="Referencia del ejercicio"
          style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }}
        />
      )}
      <label className="field">
        Crédito u origen de la imagen
        <input
          value={credit}
          maxLength={300}
          onChange={(e) => setCredit(e.target.value)}
          placeholder="Foto propia, autor o licencia"
        />
      </label>
      <label className="field">
        Agregar imagen privada (PNG, JPG o WebP; hasta 5 MB)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              if (
                file.size > 5242880 ||
                !["image/png", "image/jpeg", "image/webp"].includes(
                  file.type,
                ) ||
                credit.trim().length < 3
              )
                throw Error(
                  "Elegí una imagen de hasta 5 MB y completá su origen.",
                );
              const bytes = new Uint8Array(
                await file.slice(0, 12).arrayBuffer(),
              );
              const raster =
                (bytes[0] === 137 &&
                  bytes[1] === 80 &&
                  bytes[2] === 78 &&
                  bytes[3] === 71) ||
                (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
                (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
                  String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
              if (!raster) throw Error("El archivo no es una imagen admitida.");
              const path =
                db.scope.workspaceId +
                "/" +
                exerciseId +
                "/" +
                crypto.randomUUID();
              const up = await cloud()
                .storage.from("exercise-media")
                .upload(path, file, { contentType: file.type });
              if (up.error) throw Error("No se pudo subir la imagen.");
              await saveLibrary(db, {
                workspaceId: db.scope.workspaceId,
                operationId: crypto.randomUUID(),
                id: exerciseId,
                expectedRevision: revision,
                kind: "media",
                payload: { path, credit: credit.trim() },
              });
              setReload((x) => x + 1);
              setMessage("Imagen privada guardada.");
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
