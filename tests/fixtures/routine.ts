import { blankRoutine } from "@pulso/domain/routines";
export function routineFixture() {
  const doc = blankRoutine();
  for (const week of doc.weeks) {
    week[0].blocks = [
      {
        id: crypto.randomUUID(),
        name: "Fuerza",
        type: "main",
        macroRest: 90,
        macroTarget: "series",
        exercises: [
          {
            id: crypto.randomUUID(),
            lineageId: "00000000-0000-4000-8000-000000000001",
            exerciseId: "sentadilla",
            name: "Sentadilla",
            group: "Cuádriceps",
            type: "load_reps",
            warmup: false,
            prescription: {
              weight: 20,
              sets: 2,
              reps: 10,
              durationSec: null,
              microRest: 60,
            },
          },
        ],
      },
    ];
  }
  return doc;
}
