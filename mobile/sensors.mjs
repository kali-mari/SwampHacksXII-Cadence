export const SENSORS = [
  {type: 1, id: 0, name: 'Left elbow', group: 'Flex'},
  {type: 1, id: 1, name: 'Right elbow', group: 'Flex'},
  {type: 2, id: 0, name: 'Left upper arm', group: 'IMU'},
  {type: 2, id: 1, name: 'Left forearm', group: 'IMU'},
  {type: 2, id: 2, name: 'Right upper arm', group: 'IMU'},
  {type: 2, id: 3, name: 'Right forearm', group: 'IMU'},
];
export const sensorKey = ({type, id}) => `${type}:${id}`;
export function readingStatus(reading, now) {
  if (!reading) return 'Waiting';
  if (!reading.valid) return 'Invalid';
  return now - reading.receivedAt > 1500 ? 'Stale' : 'Live';
}
