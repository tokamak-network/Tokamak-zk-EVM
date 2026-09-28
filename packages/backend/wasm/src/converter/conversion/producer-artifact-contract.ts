interface ProducerArtifactContract {
  readonly artifacts: readonly {
    readonly name: string;
    readonly sourceFields?: Readonly<Record<string, string>>;
  }[];
}

export function requireProducerSourceFields(
  contract: ProducerArtifactContract,
  artifactName: string,
): Readonly<Record<string, string>> {
  const artifact = contract.artifacts.find((candidate) => candidate.name === artifactName);
  if (artifact?.sourceFields === undefined) {
    throw new Error(`Producer contract does not define source fields for '${artifactName}'.`);
  }
  return artifact.sourceFields;
}

export function requireProducerSourceField(
  fields: Readonly<Record<string, string>>,
  semanticName: string,
  artifactName: string,
): string {
  const fieldName = fields[semanticName];
  if (fieldName === undefined) {
    throw new Error(`Producer contract does not define '${semanticName}' for '${artifactName}'.`);
  }
  return fieldName;
}
