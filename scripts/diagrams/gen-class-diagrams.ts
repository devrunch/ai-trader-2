import { resolve, sep } from 'node:path';
import { Node, Project, Scope } from 'ts-morph';
import type { ClassDeclaration, InterfaceDeclaration, Type } from 'ts-morph';

type Declaration = ClassDeclaration | InterfaceDeclaration;

function typeName(type: Type, declarations: readonly Declaration[]): string | undefined {
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  const declaration = symbol?.getDeclarations().find((candidate) => declarations.some((local) => local === candidate));
  return declaration && (Node.isClassDeclaration(declaration) || Node.isInterfaceDeclaration(declaration))
    ? declaration.getName() : undefined;
}

function members(declaration: Declaration): string[] {
  const properties = declaration.getProperties()
    .filter((property) => !Node.isPropertyDeclaration(property) || property.getScope() === Scope.Public)
    .map((property) => `+${property.getName()}${property.hasQuestionToken() ? '?' : ''}: ${property.getTypeNode()?.getText() ?? property.getType().getText(property)}`);
  const methods = declaration.getMethods()
    .filter((method) => !Node.isMethodDeclaration(method) || method.getScope() === Scope.Public)
    .map((method) => {
      const parameters = method.getParameters().map((parameter) => `${parameter.getName()}${parameter.isOptional() ? '?' : ''}: ${parameter.getTypeNode()?.getText() ?? parameter.getType().getText(parameter)}`);
      return `+${method.getName()}(${parameters.join(', ')}) ${method.getReturnTypeNode()?.getText() ?? method.getReturnType().getText(method)}`;
    });
  const parameterProperties = Node.isClassDeclaration(declaration)
    ? declaration.getConstructors().flatMap((constructor) => constructor.getParameters()
      .filter((parameter) => parameter.isParameterProperty() && parameter.getScope() === Scope.Public)
      .map((parameter) => `+${parameter.getName()}: ${parameter.getTypeNode()?.getText() ?? parameter.getType().getText(parameter)}`)) : [];
  return [...properties, ...methods, ...parameterProperties].sort();
}

function edges(declaration: Declaration, declarations: readonly Declaration[]): string[] {
  const name = declaration.getName() ?? 'default';
  const result: string[] = [];
  const bases = Node.isClassDeclaration(declaration)
    ? [declaration.getExtends()].filter((base) => base !== undefined) : declaration.getExtends();
  for (const base of bases) {
    const target = typeName(base.getType(), declarations);
    if (target) result.push(`${target} <|-- ${name}`);
  }
  if (!Node.isClassDeclaration(declaration)) return result;
  for (const implemented of declaration.getImplements()) {
    const target = typeName(implemented.getType(), declarations);
    if (target) result.push(`${target} <|.. ${name}`);
  }
  for (const parameter of declaration.getConstructors().flatMap((constructor) => constructor.getParameters())) {
    const target = typeName(parameter.getType(), declarations);
    if (target) result.push(`${name} --> ${target}`);
  }
  return result;
}

/** SRD §14: stable code-derived diagrams, restricted to the requested module. */
export function generateClassDiagram(tsconfigPath: string, moduleDir: string): string {
  const project = new Project({ tsConfigFilePath: tsconfigPath, skipAddingFilesFromTsConfig: true });
  const root = resolve(moduleDir);
  project.addSourceFilesAtPaths(`${root.replaceAll('\\', '/')}/**/*.{ts,tsx}`);
  const declarations = project.getSourceFiles()
    .filter((file) => file.getFilePath().replaceAll('/', sep).startsWith(root + sep))
    .flatMap((file) => [...file.getClasses(), ...file.getInterfaces()])
    .filter((declaration) => declaration.isExported() && declaration.getName() !== undefined)
    .sort((left, right) => (left.getName() ?? '').localeCompare(right.getName() ?? '', 'en'));
  const nodes = declarations.map((declaration) => {
    const lines = members(declaration).map((member) => `    ${member}`);
    return [`  class ${declaration.getName() ?? 'default'} {`, ...lines, '  }'].join('\n');
  });
  const relationships = [...new Set(declarations.flatMap((declaration) => edges(declaration, declarations)))].sort();
  return ['classDiagram', ...nodes, ...relationships.map((edge) => `  ${edge}`), ''].join('\n');
}
