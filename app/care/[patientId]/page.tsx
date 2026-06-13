"use client";

import { use } from "react";
import EncounterClient from "@/components/EncounterClient";

export default function EncounterPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  return <EncounterClient patientId={patientId} />;
}
