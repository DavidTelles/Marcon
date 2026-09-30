import { ChevronDown, FlaskConical } from "lucide-react";
import { demoUsers } from "@/lib/users";
import styles from "../login.module.css";

export function DemoCredentials() {
  return (
    <details className={styles.demoDetails}>
      <summary>
        <FlaskConical size={16} aria-hidden="true" />
        <span>Experimentar com uma conta de demonstração</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.demoContent}>
        <p>
          Senha de todas as contas: <code>Marcon@123</code>
        </p>
        <ul>
          {demoUsers.map((user) => (
            <li key={user.id}>
              <strong>{user.label}</strong>
              <span>{user.email}</span>
              <span>Matrícula {user.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
