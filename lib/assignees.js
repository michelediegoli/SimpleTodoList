const defaultAssignees = ['Erminio', 'Fabio', 'Gloria', 'Laura', 'Altro']

export function getAssigneeNames(profiles = [], currentAssignee = '') {
  const profileNames = profiles
    .map(profile => profile.full_name?.trim())
    .filter(Boolean)

  const names = profileNames.length
    ? [...profileNames, 'Altro'].filter((name, index, values) => values.indexOf(name) === index)
    : defaultAssignees
  if (currentAssignee && !names.includes(currentAssignee)) {
    return [currentAssignee, ...names]
  }
  return names
}