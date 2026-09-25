import com.gachlagan.keyboard.MessageCrypto;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
public class CryptoHarness {
  public static void main(String[] args) throws Exception {
    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    for (String line; (line = reader.readLine()) != null;) {
      try {
        String[] parts = line.split("\t");
        String text = new String(Base64.getDecoder().decode(parts[1]), StandardCharsets.UTF_8), key = new String(Base64.getDecoder().decode(parts[2]), StandardCharsets.UTF_8);
        String value = parts[0].equals("seal") ? MessageCrypto.seal(text, key) : MessageCrypto.open(text, key);
        System.out.println(Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)));
      } catch (Exception e) { System.out.println("ERROR"); }
    }
  }
}
