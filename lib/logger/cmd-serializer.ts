// istanbul ignore next
export default function(cmd: string | string[]): string | string[] {
  if (typeof cmd === 'string')
    return cmd.replace(/https:\/\/[^@]*@/g, 'https://**redacted**@');
  return cmd;
}
