/**
 * Shared SSH tunnel utility.
 *
 * Used by RedisProvider and MongoDbProvider to establish a local TCP port-forward
 * through an SSH bastion host. Callers are responsible for closing the server and
 * SSH client when the database connection is shut down.
 */

import * as net from 'net'
import * as fs from 'fs'
import { Client as SshClient } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import type { ConnectionRecord } from '../../store'

export interface SshTunnelResult {
  host: string
  port: number
  server: net.Server
  sshClient: SshClient
}

/**
 * Creates an SSH tunnel to `targetHost:targetPort` through the bastion host
 * described by the `sshEnabled`/`sshHost`/… fields in `record`.
 *
 * Resolves with a `{ host, port, server, sshClient }` object. The caller must
 * call `server.close()` and `sshClient.end()` during disconnect to release
 * resources.
 */
export function createSshTunnel(
  record: ConnectionRecord,
  targetHost: string,
  targetPort: number
): Promise<SshTunnelResult> {
  return new Promise((resolve, reject) => {
    const ssh = new SshClient()

    ssh.on('ready', () => {
      const server = net.createServer((sock) => {
        ssh.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err) {
            sock.destroy()
            return
          }
          sock.pipe(stream)
          stream.pipe(sock)
          sock.on('close', () => stream.end())
          stream.on('close', () => sock.destroy())
        })
      })

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as net.AddressInfo
        resolve({ host: '127.0.0.1', port: address.port, server, sshClient: ssh })
      })

      server.on('error', (err) => {
        ssh.end()
        reject(err)
      })
    })

    ssh.on('error', reject)

    const connectConfig: ConnectConfig = {
      host: record.sshHost?.trim() || '',
      port: record.sshPort || 22,
      username: record.sshUsername?.trim() || ''
    }

    if (record.sshAuthMode === 'privateKey') {
      const keyPath = record.sshPrivateKeyPath?.trim()
      if (!keyPath) {
        reject(new Error('SSH private key path is required'))
        return
      }
      try {
        connectConfig.privateKey = fs.readFileSync(keyPath)
      } catch (err) {
        reject(new Error(`Cannot read SSH private key: ${(err as Error).message}`))
        return
      }
      if (record.sshPassphrase?.trim()) {
        connectConfig.passphrase = record.sshPassphrase
      }
    } else {
      connectConfig.password = record.sshPassword || ''
    }

    ssh.connect(connectConfig)
  })
}
