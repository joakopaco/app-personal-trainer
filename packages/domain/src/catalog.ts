export type ExerciseDefinition = {
  id: string;
  name: string;
  group: string;
  equipment: string;
  type: "load_reps" | "reps" | "time";
  aliases: string[];
};
const groups: Record<string, [string, string, string[]]> = {
  Cuádriceps: [
    "load_reps",
    "Barra",
    [
      "Sentadilla con barra",
      "Sentadilla frontal",
      "Sentadilla goblet",
      "Sentadilla sumo",
      "Sentadilla búlgara",
      "Sentadilla en multipower",
      "Prensa de piernas",
      "Prensa unilateral",
      "Extensión de rodilla",
      "Zancadas caminando",
      "Zancada inversa",
      "Zancada lateral",
      "Subida al banco",
      "Sentadilla hack",
      "Sentadilla con pausa",
    ],
  ],
  Glúteos: [
    "load_reps",
    "Mancuernas",
    [
      "Hip thrust con barra",
      "Puente de glúteos",
      "Hip thrust unilateral",
      "Patada de glúteo en polea",
      "Abducción en máquina",
      "Abducción con banda",
      "Peso muerto sumo",
      "Pull through en polea",
      "Puente con banda",
      "Buenos días con barra",
    ],
  ],
  Isquiotibiales: [
    "load_reps",
    "Barra",
    [
      "Peso muerto rumano",
      "Peso muerto convencional",
      "Peso muerto rumano unilateral",
      "Curl femoral acostado",
      "Curl femoral sentado",
      "Curl femoral de pie",
      "Curl nórdico asistido",
      "Buenos días sentado",
      "Curl femoral con fitball",
      "Peso muerto con kettlebell",
    ],
  ],
  Pecho: [
    "load_reps",
    "Mancuernas",
    [
      "Press de banca con barra",
      "Press inclinado con barra",
      "Press de banca con mancuernas",
      "Press inclinado con mancuernas",
      "Press declinado",
      "Aperturas con mancuernas",
      "Aperturas en polea",
      "Cruce de poleas",
      "Press en máquina",
      "Pullover con mancuerna",
    ],
  ],
  Espalda: [
    "load_reps",
    "Polea",
    [
      "Remo con barra",
      "Remo con mancuerna",
      "Remo sentado en polea",
      "Remo en máquina",
      "Remo con pecho apoyado",
      "Jalón al pecho",
      "Jalón con agarre neutro",
      "Jalón unilateral",
      "Pullover en polea",
      "Remo en T",
      "Remo unilateral en polea",
      "Encogimientos con mancuernas",
    ],
  ],
  Hombros: [
    "load_reps",
    "Mancuernas",
    [
      "Press militar con barra",
      "Press de hombros con mancuernas",
      "Press Arnold",
      "Elevaciones laterales",
      "Elevaciones frontales",
      "Pájaros con mancuernas",
      "Face pull",
      "Elevación lateral en polea",
      "Press de hombros en máquina",
      "Vuelo inverso en máquina",
    ],
  ],
  Bíceps: [
    "load_reps",
    "Mancuernas",
    [
      "Curl con barra",
      "Curl alternado",
      "Curl martillo",
      "Curl concentrado",
      "Curl predicador",
      "Curl en polea",
      "Curl inclinado",
      "Curl con barra EZ",
    ],
  ],
  Tríceps: [
    "load_reps",
    "Polea",
    [
      "Extensión de tríceps con cuerda",
      "Extensión con barra en polea",
      "Press francés",
      "Extensión por encima de la cabeza",
      "Patada de tríceps",
      "Press de banca cerrado",
      "Extensión unilateral en polea",
      "Extensión con mancuerna",
    ],
  ],
  Pantorrillas: [
    "load_reps",
    "Máquina",
    [
      "Elevación de talones de pie",
      "Elevación de talones sentado",
      "Elevación de talones en prensa",
      "Elevación unilateral de talón",
      "Elevación de talones con mancuernas",
    ],
  ],
  Core: [
    "reps",
    "Peso corporal",
    [
      "Crunch abdominal",
      "Crunch inverso",
      "Elevación de rodillas",
      "Elevación de piernas",
      "Dead bug",
      "Bird dog",
      "Giro ruso",
      "Pallof press",
      "Rueda abdominal",
      "Crunch en polea",
    ],
  ],
  "Core · isométrico": [
    "time",
    "Colchoneta",
    [
      "Plancha frontal",
      "Plancha lateral",
      "Hollow hold",
      "Plancha alta",
      "Plancha con apoyo de antebrazos",
    ],
  ],
  Movilidad: [
    "time",
    "Peso corporal",
    [
      "Movilidad de tobillo",
      "Movilidad de cadera 90/90",
      "Rotación torácica",
      "Estiramiento de flexor de cadera",
      "Estiramiento de pectoral",
      "Respiración diafragmática",
      "Movilidad de hombros",
      "Sentadilla profunda sostenida",
    ],
  ],
  Calistenia: [
    "reps",
    "Peso corporal",
    [
      "Flexiones de brazos",
      "Flexiones inclinadas",
      "Dominadas pronadas",
      "Dominadas supinadas",
      "Fondos en paralelas",
      "Remo invertido",
      "Sentadilla sin carga",
      "Zancadas sin carga",
    ],
  ],
  Cardio: [
    "time",
    "Cardio",
    [
      "Caminata en cinta",
      "Bicicleta fija",
      "Remo ergómetro",
      "Elíptico",
      "Cuerda",
      "Caminata del granjero",
    ],
  ],
};
function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}
function equipmentFor(name: string, fallback: string) {
  const n = slug(name);
  if (/polea|jalon|face-pull|pallof/.test(n)) return "Polea";
  if (/multipower/.test(n)) return "Multipower";
  if (
    /maquina|prensa|hack|extension-de-rodilla|curl-femoral-(acostado|sentado|de-pie)/.test(
      n,
    )
  )
    return "Máquina";
  if (/banda/.test(n)) return "Banda elástica";
  if (/fitball/.test(n)) return "Fitball";
  if (
    /mancuerna|goblet|granjero|patada-de-triceps|curl-alternado|curl-martillo|curl-concentrado|curl-inclinado|press-arnold/.test(
      n,
    )
  )
    return "Mancuernas";
  if (/kettlebell/.test(n)) return "Kettlebell";
  if (
    /con-barra|sentadilla-frontal|peso-muerto-(sumo|rumano|convencional)|buenos-dias|press-frances|press-de-banca-cerrado/.test(
      n,
    )
  )
    return "Barra";
  if (/dominadas|remo-invertido/.test(n)) return "Barra fija";
  if (/fondos/.test(n)) return "Paralelas";
  if (/rueda/.test(n)) return "Rueda abdominal";
  if (/cuerda/.test(n)) return "Cuerda";
  if (/bicicleta/.test(n)) return "Bicicleta";
  if (/cinta/.test(n)) return "Cinta";
  if (/ergometro/.test(n)) return "Remo ergómetro";
  if (/eliptico/.test(n)) return "Elíptico";
  if (
    /puente-de-gluteos|nordico|sin-carga|flexiones|hip-thrust-unilateral/.test(
      n,
    )
  )
    return "Peso corporal";
  if (
    /sentadilla|zancada|subida-al-banco|press-declinado|remo-en-t|remo-con-pecho|curl-predicador|encima-de-la-cabeza|elevacion-unilateral/.test(
      n,
    )
  )
    return "Según variante";
  return fallback;
}
export const catalog: ExerciseDefinition[] = Object.entries(groups).flatMap(
  ([group, [type, equipment, names]]) =>
    names.map((name) => ({
      id: slug(name),
      name,
      group:
        group === "Calistenia"
          ? /Dominadas|Remo/.test(name)
            ? "Espalda"
            : /Sentadilla|Zancadas/.test(name)
              ? "Cuádriceps"
              : /Fondos/.test(name)
                ? "Tríceps"
                : "Pecho"
          : group,
      equipment: equipmentFor(name, equipment),
      type: (name === "Crunch en polea"
        ? "load_reps"
        : /Puente de glúteos|Curl nórdico asistido|Hip thrust unilateral/.test(
              name,
            )
          ? "reps"
          : type) as ExerciseDefinition["type"],
      aliases: [],
    })),
);
export function searchExercises(query: string, items = catalog) {
  const q = slug(query);
  return items.filter((e) =>
    slug([e.name, e.group, e.equipment, ...e.aliases].join(" ")).includes(q),
  );
}
