import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2 } from "lucide-react";
import { cloud } from "../../adapters/supabase";
import {
  accountAction,
  accountColumns,
  gymError,
  rows,
  useResource,
  type GymAccount,
} from "./api";
import {
  CreateAccount,
  Credentials,
  Empty,
  LoadState,
  Modal,
  PageHeading,
} from "./ui";
import "./gym.css";

export function PlatformAdminLink() {
  const permission = useResource(
    () => rows<boolean>(cloud().rpc("is_platform_operator")),
    "operator",
  );
  return permission.value ? (
    <Link className="button secondary" to="/administracion">
      <Building2 size={18} />
      Administrar gimnasios
    </Link>
  ) : null;
}
export function PlatformAdmin() {
  const data = useResource(async () => {
    if (!(await rows<boolean>(cloud().rpc("is_platform_operator"))))
      throw Error("Esta sección es privada. Tu cuenta no tiene acceso.");
    const gyms = await rows<{ id: string; name: string; active: boolean }[]>(
      cloud()
        .from("gyms")
        .select("*")
        .order("created_at", { ascending: false }),
    );
    const accounts = await rows<GymAccount[]>(
      cloud().from("gym_accounts").select(accountColumns).eq("role", "admin"),
    );
    return gyms.map((g) => ({
      ...g,
      account: accounts.find((a) => a.gym_id === g.id),
    }));
  }, "platform");
  const [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [credentials, setCredentials] = useState<{
      password: string;
      email: string;
    } | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    name: string;
    active: boolean;
  } | null>(null);
  return (
    <div className="gym-page">
      <PageHeading
        eyebrow="ADMINISTRACIÓN PRIVADA"
        title="Gimnasios"
        description="Gestioná el acceso de cada gimnasio a Pulso."
        actions={
          data.value && (
            <button className="button" onClick={() => setCreate(true)}>
              <Plus size={18} />
              Agregar gimnasio
            </button>
          )
        }
      />
      <LoadState {...data} retry={data.reload} />
      {error && !confirm && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data.value?.length === 0 && (
        <Empty title="Tu primer gimnasio">
          <p>Creá su cuenta de administración para empezar.</p>
        </Empty>
      )}
      <div className="gym-grid">
        {data.value?.map((g) => (
          <article className="card stack" key={g.id}>
            <div className="gym-heading-row">
              <Building2 />
              <span className="badge">
                {g.active ? "Activo" : "Suspendido"}
              </span>
            </div>
            <h2>{g.name}</h2>
            <p>{g.account?.email}</p>
            <div className="gym-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setConfirm(g);
                }}
              >
                {g.active ? "Suspender" : "Reactivar"}
              </button>
              <button
                className="button secondary"
                disabled={busy || !g.account}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await accountAction({
                      action: "reset_password",
                      userId: g.account!.user_id,
                    });
                    setCredentials({
                      password: r.temporaryPassword!,
                      email: g.account!.email,
                    });
                  } catch (e) {
                    setError(gymError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Restablecer acceso
              </button>
            </div>
          </article>
        ))}
      </div>
      {create && (
        <CreateAccount
          kind="gym"
          close={() => setCreate(false)}
          done={data.reload}
        />
      )}{" "}
      {credentials && (
        <Credentials {...credentials} close={() => setCredentials(null)} />
      )}{" "}
      {confirm && (
        <Modal
          title={`${confirm.active ? "Suspender" : "Reactivar"} ${confirm.name}`}
          close={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p>
            {confirm.active
              ? "Se pausará el acceso del gimnasio y sus entrenados. Las rutinas y el historial se conservan."
              : "El gimnasio y sus entrenados activos podrán volver a ingresar."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await accountAction({
                  action: "set_gym_active",
                  gymId: confirm.id,
                  active: !confirm.active,
                });
                setConfirm(null);
                data.reload();
              } catch (e) {
                setError(gymError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar
          </button>
        </Modal>
      )}
    </div>
  );
}
