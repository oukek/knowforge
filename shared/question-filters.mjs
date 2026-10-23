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
        : origin === "editorial"
          ? !publicReport && question.provenance !== "ai-generated"
          : origin === "ai"
            ? question.provenance === "ai-generated"
            : false))
  );
}
