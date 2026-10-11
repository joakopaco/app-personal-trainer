import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Users,
  ClipboardList,
  Dumbbell,
  Pencil,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import { cloud } from "../../adapters/supabase";
import {
  accountAction,
  accountColumns,
  command,
  dateLabel,
  gymError,
  routineColumns,
  rows,
  useResource,
  type GymAccount,
  type GymRoutine,
  type GymSession,
  type GymRevision,
} from "./api";
import { useGym } from "./GymContext";
import {
  CreateAccount,
  Credentials,
  Empty,
  LoadState,
  Modal,
  PageHeading,
} from "./ui";
import { cloneRoutineDocument } from "@pulso/domain/routines";

export function GymDashboard() {
  const { access } = useGym();
  const [create, setCreate] = useState(false);
  const data = useResource(async () => {
    const [activeMembers, publishedRoutines, sessions, openSessions] =
      await Promise.all([
        cloud()
          .from("gym_accounts")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "member")
          .eq("active", true),
        cloud()
          .from("gym_routines")
          .select("id", { count: "exact", head: true })
          .eq("kind", "catalog")
          .eq("retired", false)
          .not("published_revision_id", "is", null),
        rows<GymSession[]>(
          cloud()
            .from("gym_sessions")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(8),
        ),
        cloud()
          .from("gym_sessions")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ]);
    if (openSessions.error) throw openSessions.error;
    if (activeMembers.error) throw activeMembers.error;
    if (publishedRoutines.error) throw publishedRoutines.error;
    const memberIds = [...new Set(sessions.map((s) => s.member_id))];
    const members = memberIds.length
      ? await rows<GymAccount[]>(
          cloud()
            .from("gym_accounts")
            .select(accountColumns)
            .in("user_id", memberIds),
        )
      : [];
    return {
      members,
      sessions,
      memberCount: activeMembers.count ?? 0,
      routineCount: publishedRoutines.count ?? 0,
      openCount: openSessions.count ?? 0,
    };
  }, access.gymId);
  return (
    <>
      <PageHeading
        eyebrow="TU GIMNASIO EN PULSO"
        title={access.gymName}
        description="Rutinas, personas y progreso, en un mismo lugar."
        actions={
          <button className="button" onClick={() => setCreate(true)}>
            <Plus size={18} />
            Agregar entrenado
          </button>
        }
      />
      <LoadState {...data} retry={data.reload} />
      {data.value && (
        <>
          <div className="gym-stats">
            <Link className="card" to="/gimnasio/entrenados">
              <Users />
              <strong>{data.value.memberCount}</strong>
              <span>Entrenados activos</span>
            </Link>
            <Link className="card" to="/gimnasio/rutinas">
              <ClipboardList />
              <strong>{data.value.routineCount}</strong>
              <span>Rutinas publicadas</span>
            </Link>
            <div className="card">
              <Dumbbell />
              <strong>{data.value.openCount}</strong>
              <span>Entrenando ahora</span>
            </div>
          </div>
          <section className="card stack">
            <div className="gym-heading-row">
              <h2>Actividad reciente</h2>
              <Link className="button secondary" to="/gimnasio/rutinas/nueva">
                <Plus size={18} />
                Crear rutina
              </Link>
            </div>
            {!data.value.sessions.length ? (
              <p className="muted">
                Los entrenamientos aparecerán acá cuando tus entrenados
                empiecen.
              </p>
            ) : (
              data.value.sessions.map((s) => (
                <Link
                  className="gym-list-row"
                  key={s.id}
                  to={"/gimnasio/entrenados/" + s.member_id}
                >
                  <div>
                    <strong>
                      {data.value!.members.find(
                        (m) => m.user_id === s.member_id,
                      )?.name || "Entrenado"}
                    </strong>
                    <p className="muted">
                      {s.routine_name} · {dateLabel(s.started_at)}
                    </p>
                  </div>
                  <span className="badge">
                    {s.status === "open" ? "Entrenando" : "Finalizado"}
                  </span>
                  <ArrowUpRight size={18} />
                </Link>
              ))
            )}
          </section>
        </>
      )}
      {create && (
        <CreateAccount
          kind="member"
          close={() => setCreate(false)}
          done={data.reload}
        />
      )}
    </>
  );
}
export function GymMembers() {
  const { access } = useGym();
  const [query, setQuery] = useState(""),
    [create, setCreate] = useState(false);
  const data = useResource(
    () =>
      rows<GymAccount[]>(
        cloud()
          .from("gym_accounts")
          .select(accountColumns)
          .eq("role", "member")
          .order("name"),
      ),
    access.gymId,
  );
  const filtered = data.value?.filter((m) =>
    (m.name + " " + m.email)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="ACOMPAÑÁ A CADA PERSONA"
        title="Entrenados"
        description="Cada cuenta pertenece a tu gimnasio y conserva su propio progreso."
        actions={
          <button className="button" onClick={() => setCreate(true)}>
            <Plus size={18} />
            Agregar entrenado
          </button>
        }
      />
      <label className="field gym-search">
        Buscar entrenado
        <input
          type="search"
          placeholder="Nombre o email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <LoadState {...data} retry={data.reload} />
      <div className="gym-grid">
        {filtered?.map((m) => (
          <Link
            className="card stack gym-person"
            key={m.user_id}
            to={"/gimnasio/entrenados/" + m.user_id}
          >
            <div className="gym-heading-row">
              <span className="gym-avatar">
                {m.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="badge">
                {!m.active
                  ? "Suspendido"
                  : m.must_change_password
                    ? "Primer ingreso pendiente"
                    : "Activo"}
              </span>
            </div>
            <h2>{m.name}</h2>
            <p className="muted">{m.email}</p>
            <span>
              Ver ficha <ArrowUpRight size={16} />
            </span>
          </Link>
        ))}
      </div>
      {filtered?.length === 0 && (
        <Empty title={query ? "Sin coincidencias" : "Tu primer entrenado"}>
          <p>
            {query
              ? "Probá con otro nombre o email."
              : "Agregá una cuenta y entregale sus datos de acceso."}
          </p>
        </Empty>
      )}
      {create && (
        <CreateAccount
          kind="member"
          close={() => setCreate(false)}
          done={data.reload}
        />
      )}
    </>
  );
}
export function GymMemberProfile() {
  const { id = "" } = useParams(),
    { access } = useGym(),
    navigate = useNavigate();
  const data = useResource(async () => {
    const member = await rows<GymAccount>(
      cloud()
        .from("gym_accounts")
        .select(accountColumns)
        .eq("user_id", id)
        .eq("role", "member")
        .single(),
    );
    const [routines, notes, audit] = await Promise.all([
      rows<GymRoutine[]>(
        cloud()
          .from("gym_routines")
          .select(routineColumns)
          .eq("member_id", id)
          .order("created_at", { ascending: false }),
      ),
      rows<{ notes: string }[]>(
        cloud().from("gym_member_notes").select("notes").eq("member_id", id),
      ),
      rows<{ id: string; action: string; created_at: string }[]>(
        cloud()
          .from("gym_audit")
          .select("id,action,created_at")
          .eq("member_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      ),
    ]);
    return { member, routines, notes: notes[0]?.notes || "", audit };
  }, access.gymId + id);
  const [edit, setEdit] = useState(false),
    [assign, setAssign] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [credentials, setCredentials] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false);
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(gymError(e));
    } finally {
      setBusy(false);
    }
  }
  const m = data.value?.member;
  return (
    <>
      <PageHeading
        back="/gimnasio/entrenados"
        eyebrow="FICHA DEL ENTRENADO"
        title={m?.name || "Entrenado"}
        description={m?.email}
        actions={
          m && (
            <button className="button secondary" onClick={() => setEdit(true)}>
              <Pencil size={18} />
              Editar ficha
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
      {m && data.value && (
        <>
          <nav className="gym-profile-nav" aria-label="Ficha del entrenado">
            <a className="button" href="#gym-member-info">
              <Users size={18} />
              Información
            </a>
            <a className="button secondary" href="#gym-member-routines">
              <ClipboardList size={18} />
              Rutinas
            </a>
            <Link
              className="button secondary"
              to={"/gimnasio/entrenados/" + id + "/progreso"}
            >
              <TrendingUp size={18} />
              Progreso
            </Link>
          </nav>
          <div className="gym-profile-grid">
            <aside className="card stack" id="gym-member-info">
              <h2>Información</h2>
              <dl className="gym-details">
                <dt>Acceso</dt>
                <dd>{m.active ? "Activo" : "Suspendido"}</dd>
                <dt>Miembro desde</dt>
                <dd>{dateLabel(m.created_at)}</dd>
                <dt>Género</dt>
                <dd>
                  {m.gender === "female"
                    ? "Femenino"
                    : m.gender === "male"
                      ? "Masculino"
                      : "Sin indicar"}
                </dd>
              </dl>
              <h3>Notas privadas</h3>
              <p className="muted">
                {data.value.notes || "Sin notas. Solo las ve el gimnasio."}
              </p>
              <div className="gym-account-actions stack">
                <h3>
                  <ShieldCheck size={16} /> Acceso a la cuenta
                </h3>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setConfirm(true);
                  }}
                >
                  {m.active ? "Suspender acceso" : "Reactivar acceso"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const r = await accountAction({
                        action: "reset_password",
                        userId: id,
                      });
                      setCredentials(r.temporaryPassword!);
                    })
                  }
                >
                  Restablecer contraseña
                </button>
              </div>
            </aside>
            <div className="stack">
              <section className="card stack" id="gym-member-routines">
                <div className="gym-heading-row">
                  <h2>Rutinas personalizadas</h2>
                  <div className="gym-actions">
                    <button
                      className="button secondary"
                      onClick={() => setAssign(true)}
                    >
                      Asignar rutina
                    </button>
                    <Link
                      className="button"
                      to={"/gimnasio/rutinas/nueva?member=" + id}
                    >
                      <Plus size={18} />
                      Crear personalizada
                    </Link>
                  </div>
                </div>
                <p className="muted">
                  Las copias son independientes del catálogo. El entrenado elige
                  cuál usar.
                </p>
                {data.value.routines
                  .filter((r) => r.kind === "personal")
                  .map((r) => (
                    <Link
                      className="gym-list-row"
                      key={r.id}
                      to={"/gimnasio/rutinas/" + r.id}
                    >
                      <div>
                        <strong>{r.name}</strong>
                        <p className="muted">
                          {dateLabel(r.created_at)} ·{" "}
                          {r.retired
                            ? "Retirada"
                            : r.published_revision_id
                              ? "Disponible"
                              : "Borrador"}
                        </p>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  ))}
                {!data.value.routines.some((r) => r.kind === "personal") && (
                  <p>No tiene rutinas personalizadas todavía.</p>
                )}
              </section>
              <section className="card stack">
                <h2>Historial de actividad</h2>
                {data.value.audit.length ? (
                  data.value.audit.map((a) => (
                    <div className="gym-list-row" key={a.id}>
                      <span>{activityLabel(a.action)}</span>
                      <small>{dateLabel(a.created_at)}</small>
                    </div>
                  ))
                ) : (
                  <p className="muted">Todavía no hay actividad registrada.</p>
                )}
              </section>
            </div>
          </div>
          {edit && (
            <EditMember
              member={m}
              notes={data.value.notes}
              close={() => setEdit(false)}
              done={data.reload}
            />
          )}{" "}
          {assign && (
            <AssignRoutine
              memberId={id}
              close={() => setAssign(false)}
              done={(routineId) => navigate("/gimnasio/rutinas/" + routineId)}
            />
          )}{" "}
          {credentials && (
            <Credentials
              email={m.email}
              password={credentials}
              close={() => setCredentials(null)}
            />
          )}{" "}
          {confirm && (
            <Modal
              title={m.active ? "Suspender acceso" : "Reactivar acceso"}
              close={() => {
                if (!busy) setConfirm(false);
              }}
            >
              <p>Sus rutinas y entrenamientos se conservan.</p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await command("set_member_active", {
                      userId: id,
                      active: !m.active,
                    });
                    setConfirm(false);
                    data.reload();
                  })
                }
              >
                Confirmar
              </button>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
function EditMember({
  member,
  notes,
  close,
  done,
}: {
  member: GymAccount;
  notes: string;
  close: () => void;
  done: () => void;
}) {
  const [name, setName] = useState(member.name),
    [gender, setGender] = useState(member.gender),
    [memo, setMemo] = useState(notes),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Editar ficha"
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await command("update_member", {
              userId: member.user_id,
              name,
              gender,
              notes: memo,
            });
            done();
            close();
          } catch (e) {
            setError(gymError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Nombre y apellido
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          Género
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="unspecified">Sin indicar</option>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
          </select>
        </label>
        <label className="field">
          Notas privadas
          <textarea
            maxLength={4000}
            rows={4}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button" disabled={busy}>
          Guardar ficha
        </button>
      </form>
    </Modal>
  );
}
function AssignRoutine({
  memberId,
  close,
  done,
}: {
  memberId: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const data = useResource(
    () =>
      rows<GymRoutine[]>(
        cloud()
          .from("gym_routines")
          .select(routineColumns)
          .eq("kind", "catalog")
          .eq("retired", false)
          .not("published_revision_id", "is", null),
      ),
    "assign",
  );
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Asignar desde el catálogo"
      close={() => {
        if (!busy) close();
      }}
    >
      <p>Prepará una copia personalizada y publicala cuando esté lista.</p>
      <LoadState {...data} retry={data.reload} />
      <label className="field">
        Rutina
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Elegí una rutina</option>
          {data.value?.map((r) => (
            <option key={r.id} value={r.published_revision_id!}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="button"
        disabled={!selected || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await rows<GymRevision>(
              cloud()
                .from("gym_routine_revisions")
                .select("*")
                .eq("id", selected)
                .single(),
            );
            const result = await command("save_routine", {
              kind: "personal",
              memberId,
              document: cloneRoutineDocument(r.document),
            });
            done(result.id);
          } catch (e) {
            setError(gymError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Preparar copia
      </button>
    </Modal>
  );
}
export const activityLabel = (action: string) =>
  ({
    create_member: "Cuenta creada",
    save_routine: "Borrador guardado",
    publish_routine: "Rutina publicada",
    select_routine: "Rutina elegida",
    start_session: "Entrenamiento iniciado",
    save_session: "Series guardadas",
    finish_session: "Entrenamiento finalizado",
    update_member: "Ficha actualizada",
    access_reset: "Acceso restablecido",
    password_changed: "Contraseña actualizada",
    set_member_active: "Estado de acceso actualizado",
    discard_routine: "Borrador descartado",
    retire_routine: "Rutina retirada",
  })[action] || "Cuenta actualizada";
