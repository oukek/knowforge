export function matchesQuestionSource(
  question,
  { company = "", origin = "" } = {},
) {
  const publicReport = question.provenance === "public-report-adapted";
  return (
    (!company || (publicReport && question.company === company)) &&
    (!origin ||
      (origin === "public"
        ? publicReport
        : origin === "friend"
          ? question.provenance === "user-reported"
          : origin === "inferred"
            ? question.provenance === "editorial-inference"
            : origin === "editorial"
              ? !publicReport &&
                ![
                  "ai-generated",
                  "user-reported",
                  "editorial-inference",
                ].includes(question.provenance)
              : origin === "ai"
                ? question.provenance === "ai-generated"
                : false))
  );
}
