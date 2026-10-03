export function safeReturnPath(path:string|null){
  return path && /^\/(hoy|alumnos|rutinas|ajustes)(\/[a-zA-Z0-9-]+)?$/.test(path)?path:'/hoy';
}
