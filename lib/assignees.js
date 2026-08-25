export const assigneeNames = ['Erminio', 'Fabio', 'Gloria', 'Laura']

export function getAssigneeNames() {
  return assigneeNames
}

export function isSelectableProfile(profile) {
  return profile.full_name?.trim().toLowerCase() !== 'michele'
}

export function formatPersonName(name) {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}