/** People Hub mark: connected people in a navy circle. Wordmark: People in navy, Hub in gold. */
const NODES = (c: string) => (
  <>
    <g stroke={c} strokeWidth={16}>
      <line x1="481" y1="272" x2="481" y2="304" /><line x1="481" y1="400" x2="481" y2="433" />
      <line x1="529" y1="481" x2="561" y2="481" /><line x1="273" y1="481" x2="305" y2="481" />
      <line x1="401" y1="481" x2="433" y2="481" /><line x1="353" y1="529" x2="353" y2="561" />
    </g>
    <g fill="none" stroke={c} strokeWidth={16}><circle cx="481" cy="224" r="41" /><circle cx="481" cy="481" r="41" /><circle cx="225" cy="481" r="41" /></g>
    <g fill={c}><circle cx="481" cy="352" r="48" /><circle cx="609" cy="481" r="48" /><circle cx="353" cy="481" r="48" /><circle cx="353" cy="609" r="48" /></g>
  </>
);

export function PeopleHubMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="80 80 674 674" role="img" aria-label="People Hub" style={{ flex: "none", display: "block" }}>
      <circle cx="417" cy="417" r="330" fill="#022850" />
      {NODES("#ececec")}
    </svg>
  );
}

export function PeopleHubWordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="phw" style={{ fontSize: size }}>
      <span className="phw-p">People</span> <span className="phw-h">Hub</span>
    </span>
  );
}
